import './style.css'
import { auth, db } from './firebase.js'
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc, getDocs, setDoc, updateDoc, collection } from 'firebase/firestore'

const app = document.querySelector('#app')
const provider = new GoogleAuthProvider()

// ---------- PRIJAVA ----------
function prikaziPrijavo() {
  app.innerHTML = `
    <h1>Odbojka</h1>
    <p>Četrtek ob 20.30 – dvorana Vižmarje-Brod</p>
    <button id="prijava">Prijava z Googlom</button>
    <p id="napaka" style="color:#f66"></p>
  `
  document.querySelector('#prijava').onclick = async () => {
    try {
      await signInWithPopup(auth, provider)
    } catch (e) {
      document.querySelector('#napaka').textContent = 'Prijava ni uspela: ' + e.code
    }
  }
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

// ---------- DOMOV ----------
async function prikaziDomov(igralec) {
  const jeAdmin = igralec.vloga === 'admin'
  app.innerHTML = `
    <h1>Odbojka</h1>
    <p>Pozdravljen, <b>${igralec.ime}</b>${jeAdmin ? ' (admin)' : ''}</p>
    <button id="odjava">Odjava</button>
    ${jeAdmin ? '<div id="admin"></div>' : ''}
  `
  document.querySelector('#odjava').onclick = () => signOut(auth)
  if (jeAdmin) await prikaziAdmin()
}

// ---------- ADMIN ----------
async function prikaziAdmin() {
  const div = document.querySelector('#admin')
  const snap = await getDocs(collection(db, 'igralci'))
  const igralci = snap.docs
    .map(d => ({ email: d.id, ...d.data() }))
    .sort((a, b) => a.ime.localeCompare(b.ime, 'sl'))
  const aktivnih = igralci.filter(i => i.aktiven).length

  div.innerHTML = `
    <h2>Igralci (${aktivnih} aktivnih)</h2>
    <table>
      ${igralci.map(i => `
        <tr style="${i.aktiven ? '' : 'opacity:0.4'}">
          <td>${i.ime}</td>
          <td>${i.email}</td>
          <td>${i.vloga === 'admin'
            ? 'admin'
            : `<button data-email="${i.email}" data-aktiven="${i.aktiven}">${i.aktiven ? 'Izklopi' : 'Vklopi'}</button>`}
          </td>
        </tr>`).join('')}
    </table>

    <h3>Dodaj igralca</h3>
    <input id="novoIme" placeholder="Ime in priimek">
    <input id="novEmail" placeholder="Gmail naslov">
    <button id="dodaj">Dodaj</button>
    <p id="adminSporocilo" style="color:#f66"></p>
  `

  div.querySelectorAll('button[data-email]').forEach(btn => {
    btn.onclick = async () => {
      await updateDoc(doc(db, 'igralci', btn.dataset.email), {
        aktiven: btn.dataset.aktiven !== 'true'
      })
      prikaziAdmin()
    }
  })

  div.querySelector('#dodaj').onclick = async () => {
    const ime = div.querySelector('#novoIme').value.trim()
    const email = div.querySelector('#novEmail').value.trim().toLowerCase()
    const sporocilo = div.querySelector('#adminSporocilo')
    if (!ime || !email.includes('@')) {
      sporocilo.textContent = 'Vpiši ime in veljaven e-naslov.'
      return
    }
    try {
      await setDoc(doc(db, 'igralci', email), { ime, vloga: 'igralec', aktiven: true })
      prikaziAdmin()
    } catch (e) {
      sporocilo.textContent = 'Napaka: ' + e.code
    }
  }
}

// ---------- ZAGON ----------
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