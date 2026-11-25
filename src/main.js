import './style.css'
import { auth } from './firebase.js'
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth'

const app = document.querySelector('#app')
const provider = new GoogleAuthProvider()

onAuthStateChanged(auth, (user) => {
  if (user) {
    app.innerHTML = `
      <h1>Odbojka</h1>
      <p>Pozdravljen, <b>${user.displayName}</b></p>
      <p>${user.email}</p>
      <button id="odjava">Odjava</button>
    `
    document.querySelector('#odjava').onclick = () => signOut(auth)
  } else {
    app.innerHTML = `
      <h1>Odbojka</h1>
      <p>Četrtek ob 20.30 – dvorana Vižmarje-Brod</p>
      <button id="prijava">Prijava z Googlom</button>
    `
    document.querySelector('#prijava').onclick = () => signInWithPopup(auth, provider)
  }
})