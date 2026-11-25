import './style.css'
import { auth, db } from './firebase.js'
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'

const app = document.querySelector('#app')
const provider = new GoogleAuthProvider()

function prikaziPrijavo() {
  app.innerHTML = `
    <h1>Odbojka</h1>
    <p>Četrtek ob 20.30 – dvorana Vižmarje-Brod</p>
    <button id="prijava">Prijava z Googlom</button>
  `
  document.querySelector('#prijava').onclick = () => signInWithPopup(auth, provider)
}

function prikaziNiDostopa(user) {
  app.innerHTML = `
    <h1>Odbojka</h1>
    <p>Račun <b>${user.email}</b> ni na seznamu igralcev.</p>
    <p>Pošlji ta e-naslov Gregi, da te doda.</p>
    <button id="odjava">Odjava</button>
  `
  document.querySelector('#odjava').onclick = () => signOut(auth)
}

function prikaziDomov(igralec) {
  app.innerHTML = `
    <h1>Odbojka</h1>
    <p>Pozdravljen, <b>${igralec.ime}</b>${igralec.vloga === 'admin' ? ' (admin)' : ''}</p>
    <button id="odjava">Odjava</button>
  `
  document.querySelector('#odjava').onclick = () => signOut(auth)
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    prikaziPrijavo()
    return
  }
  app.innerHTML = '<p>Nalagam ...</p>'
  try {
    const snap = await getDoc(doc(db, 'igralci', user.email.toLowerCase()))
    if (snap.exists() && snap.data().aktiven) {
      prikaziDomov(snap.data())
    } else {
      prikaziNiDostopa(user)
    }
  } catch (napaka) {
    console.error(napaka)
    prikaziNiDostopa(user)
  }
})