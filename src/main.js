import './style.css'
import { auth, db } from './firebase.js'
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth'
import {
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, onSnapshot
} from 'firebase/firestore'

const app = document.querySelector('#app')
const provider = new GoogleAuthProvider()
let ustaviPoslusanje = null

// ---------- POMOŽNO ----------
function varno(t) {
  return String(t ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

function naslednjiCetrtek() {
  const d = new Date()
  let dni = (4 - d.getDay() + 7) % 7
  const poKoncu = d.getHours() > 22 || (d.getHours() === 22 && d.getMinutes() >= 30)
  if (dni === 0 && poKoncu) dni = 7
  d.setDate(d.getDate() + dni)
  return d
}

function datumId(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dan = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${dan}`
}

function lepDatum(d) {
  return d.toLocaleDateString('sl-SI', { weekday: 'long', day: 'numeric', month: 'long' })
}

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
    <p>Račun <b>${varno(user.email)}</b> ni na seznamu igralcev.</p>
    <p>Pošlji ta e-naslov Gregi, da te doda.</p>
    <button id="odjava">Odjava</button>
  `
  document.querySelector('#odjava').onclick = () => signOut(auth)
}

// ---------- DOMOV ----------
async function prikaziDomov(user, igralec) {
  const jeAdmin = igralec.vloga === 'admin'
  const mojEmail = user.email.toLowerCase()
  const cetrtek = naslednjiCetrtek()
  const id = datumId(cetrtek)

  app.innerHTML = `
    <h1>Odbojka</h1>
    <p>Pozdravljen, <b>${varno(igralec.ime)}</b>${jeAdmin ? ' (admin)' : ''} · <a href="#" id="odjava">Odjava</a></p>
    <h2>${lepDatum(cetrtek)} ob 20.30</h2>
    <p>Dvorana Vižmarje-Brod</p>
    <div id="termin">Nalagam ...</div>
    ${jeAdmin ? '<hr><div id="admin"></div>' : ''}
  `
  document.querySelector('#odjava').onclick = (e) => {
    e.preventDefault()
    signOut(auth)
  }

  const snapIgralci = await getDocs(collection(db, 'igralci'))
  const igralci = snapIgralci.docs
    .map(d => ({ email: d.id, ...d.data() }))
    .filter(i => i.aktiven)
    .sort((a, b) => a.ime.localeCompare(b.ime, 'sl'))

  ustaviPoslusanje = onSnapshot(collection(db, 'termini', id, 'prisotnost'), (snap) => {
    const prisotnost = {}
    snap.forEach(d => { prisotnost[d.id] = d.data() })
    narisiTermin(igralci, prisotnost, id, mojEmail, igralec.ime)
  })

  if (jeAdmin) await prikaziAdmin()
}

// ---------- TERMIN ----------
function narisiTermin(igralci, prisotnost, id, mojEmail, mojeIme) {
  const div = document.querySelector('#termin')
  if (!div) return
  let pride = 0

  const vrstice = igralci.map(i => {
    const p = prisotnost[i.email]
    const nePride = p?.status === 'ne_pride'
    const namestnik = p?.namestnik || ''
    if (!nePride || namestnik) pride++

    let stanje
    if (!nePride) stanje = '✅'
    else if (namestnik) stanje = `🔄 namesto pride: <b>${varno(namestnik)}</b>`
    else stanje = '❌ ne pride – <b>iščemo zamenjavo</b>'

    let gumbi = ''
    if (i.email === mojEmail) {
      gumbi += nePride
        ? '<button data-akcija="pridem">Vseeno pridem</button>'
        : '<button data-akcija="nepridem">Ne pridem</button>'
    }
    if (nePride) {
      gumbi += namestnik
        ? ` <button data-akcija="brisiZamenjavo" data-email="${i.email}">Odstrani zamenjavo</button>`
        : ` <button data-akcija="zamenjava" data-email="${i.email}">Vpiši zamenjavo</button>`
    }

    return `<tr><td>${varno(i.ime)}</td><td>${stanje}</td><td>${gumbi}</td></tr>`
  }).join('')

  const vseh = igralci.length
  div.innerHTML = `
    <h3>${pride}/${vseh} ${pride < vseh ? `· manjka ${vseh - pride}` : '· ekipa je polna'}</h3>
    <table>${vrstice}</table>
  `

  div.querySelectorAll('button[data-akcija]').forEach(btn => {
    btn.onclick = () => izvediAkcijo(btn.dataset.akcija, btn.dataset.email, id, mojEmail, mojeIme)
  })
}

async function izvediAkcijo(akcija, email, id, mojEmail, mojeIme) {
  const ref = (e) => doc(db, 'termini', id, 'prisotnost', e)
  try {
    if (akcija === 'nepridem') {
      await setDoc(ref(mojEmail), { status: 'ne_pride', namestnik: '', vpisal: mojeIme, cas: new Date() })
    } else if (akcija === 'pridem') {
      await deleteDoc(ref(mojEmail))
    } else if (akcija === 'zamenjava') {
      const ime = prompt('Ime zamenjave:')
      if (!ime || !ime.trim()) return
      await updateDoc(ref(email), { namestnik: ime.trim(), vpisal: mojeIme, cas: new Date() })
    } else if (akcija === 'brisiZamenjavo') {
      if (!confirm('Odstranim zamenjavo?')) return
      await updateDoc(ref(email), { namestnik: '', vpisal: mojeIme, cas: new Date() })
    }
  } catch (e) {
    alert('Napaka: ' + e.code)
  }
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
          <td>${varno(i.ime)}</td>
          <td>${varno(i.email)}</td>
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
  if (ustaviPoslusanje) {
    ustaviPoslusanje()
    ustaviPoslusanje = null
  }
  if (!user) {
    prikaziPrijavo()
    return
  }
  app.innerHTML = '<p>Nalagam ...</p>'
  try {
    const snap = await getDoc(doc(db, 'igralci', user.email.toLowerCase()))
    if (snap.exists() && snap.data().aktiven) {
      prikaziDomov(user, snap.data())
    } else {
      prikaziNiDostopa(user)
    }
  } catch (napaka) {
    console.error(napaka)
    prikaziNiDostopa(user)
  }
})