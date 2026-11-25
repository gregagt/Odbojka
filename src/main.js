import './style.css'
import { auth, db } from './firebase.js'
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth'
import {
  doc, getDoc, getDocs, setDoc, updateDoc, collection, onSnapshot
} from 'firebase/firestore'

const app = document.querySelector('#app')
const PRAVILA_URL = 'https://sport-rodica.splet.arnes.si/igre-z-zogo/odbojka/'
const ikonaPravila = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><path d="M9 7h7M9 11h5"/></svg>`
const gumbPravila = `<a class="gumb-pravila" href="${PRAVILA_URL}" target="_blank" rel="noopener">${ikonaPravila}<span>Pravila</span></a>`
const provider = new GoogleAuthProvider()
let ustaviPoslusanje = null

// Stanje aplikacije
const s = {
  jaz: null,              // { email, ime, vloga }
  pogled: 'termin',       // 'termin' ali 'igralci'
  cetrtek: null,
  id: null,
  igralci: [],            // aktivni igralci
  vsiIgralci: [],         // vsi (za admina)
  prisotnost: {},
  nalagam: true,
  odprtaZamenjava: null   // email igralca, kjer je odprt vnos zamenjave
}

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
  const t = d.toLocaleDateString('sl-SI', { weekday: 'long', day: 'numeric', month: 'long' })
  return t.charAt(0).toUpperCase() + t.slice(1)
}

function inicialke(ime) {
  return ime.split(' ').filter(Boolean).slice(0, 2).map(b => b[0].toUpperCase()).join('')
}

function barva(ime) {
  let h = 0
  for (const c of ime) h = (h * 31 + c.charCodeAt(0)) % 360
  return h
}

function avatar(ime) {
  return `<span class="avatar" style="--h:${barva(ime)}">${varno(inicialke(ime))}</span>`
}

// ---------- PRIJAVA ----------
function prikaziPrijavo() {
  app.innerHTML = `
    <div class="prijava">
      <img class="logo" src="/zoga.svg" alt="">
      <h1>Odbojka</h1>
      <p class="podnaslov">Vsak četrtek ob 20.30<br>Dvorana Vižmarje-Brod</p>
      <button class="gumb gumb-google" id="prijava">Prijava z Googlom</button>
      <p class="napaka" id="napaka"></p>
      ${gumbPravila}
    </div>
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
    <div class="prijava">
      <div class="logo">🔒</div>
      <h1>Ni dostopa</h1>
      <p class="podnaslov">Račun <b>${varno(user.email)}</b><br>ni na seznamu igralcev.</p>
      <p class="podnaslov">Pošlji ta e-naslov Gregi, da te doda.</p>
      <button class="gumb gumb-sekundarni" id="odjava">Odjava</button>
    </div>
  `
  document.querySelector('#odjava').onclick = () => signOut(auth)
}

// ---------- ZAČETEK ----------
async function zacniAplikacijo(user, igralec) {
  s.jaz = { email: user.email.toLowerCase(), ...igralec }
  s.pogled = 'termin'
  s.cetrtek = naslednjiCetrtek()
  s.id = datumId(s.cetrtek)
  s.nalagam = true
  s.odprtaZamenjava = null

  await naloziIgralce()
  render()

  ustaviPoslusanje = onSnapshot(collection(db, 'termini', s.id, 'prisotnost'), (snap) => {
    const p = {}
    snap.forEach(d => { p[d.id] = d.data() })
    s.prisotnost = p
    s.nalagam = false
    render()
  })
}

async function naloziIgralce() {
  const snap = await getDocs(collection(db, 'igralci'))
  s.vsiIgralci = snap.docs
    .map(d => ({ email: d.id, ...d.data() }))
    .sort((a, b) => a.ime.localeCompare(b.ime, 'sl'))
  s.igralci = s.vsiIgralci.filter(i => i.aktiven)
}

// ---------- IZRIS ----------
function render() {
  // ohrani vneseno besedilo in fokus, ko se stran ponovno izriše
  const vrednosti = {}
  app.querySelectorAll('input[id]').forEach(el => { vrednosti[el.id] = el.value })
  const fokus = document.activeElement?.id

  const jeAdmin = s.jaz.vloga === 'admin'
  app.innerHTML = `
    <header class="glava">
      <div class="znamka"><img src="/zoga.svg" alt=""> Odbojka</div>
      <div class="glava-desno">
        ${gumbPravila}
        ${avatar(s.jaz.ime)}
        <button class="gumb-tekst" data-akcija="odjava">Odjava</button>
      </div>
    </header>
    ${jeAdmin ? `
      <nav class="zavihki">
        <button class="${s.pogled === 'termin' ? 'aktiven' : ''}" data-akcija="pogled" data-pogled="termin">Termin</button>
        <button class="${s.pogled === 'igralci' ? 'aktiven' : ''}" data-akcija="pogled" data-pogled="igralci">Igralci</button>
      </nav>` : ''}
    <main>
      ${s.pogled === 'igralci' && jeAdmin ? htmlIgralci() : htmlTermin()}
    </main>
  `

  for (const [id, v] of Object.entries(vrednosti)) {
    const el = document.getElementById(id)
    if (el) el.value = v
  }
  const zaFokus = (fokus && document.getElementById(fokus)) ||
    (s.odprtaZamenjava && document.getElementById('zam-' + s.odprtaZamenjava))
  if (zaFokus && zaFokus.tagName === 'INPUT') zaFokus.focus()
}

function stevec() {
  let pride = 0, nePride = 0, brez = 0
  for (const i of s.igralci) {
    const p = s.prisotnost[i.email]
    if (p?.status === 'pride' || (p?.status === 'ne_pride' && p.namestnik)) pride++
    else if (p?.status === 'ne_pride') nePride++
    else brez++
  }
  return { pride, nePride, brez, vseh: s.igralci.length }
}

function htmlTermin() {
  if (s.nalagam) return '<div class="nalagam"><span class="vrtavka"></span></div>'

  const { pride, nePride, brez, vseh } = stevec()
  const manjka = vseh - pride
  const odstotek = vseh ? Math.round((pride / vseh) * 100) : 0
  const moj = s.prisotnost[s.jaz.email]
  const jazNePridem = moj?.status === 'ne_pride'
  const jazPridem = moj?.status === 'pride'

  let opomba = ''
  if (jazNePridem && moj.namestnik) {
    opomba = `
      <div class="moja-zamenjava">
        <span>Namesto tebe pride <b>${varno(moj.namestnik)}</b></span>
        <button class="gumb-majhen sekundarni" data-akcija="brisiZamenjavo" data-email="${s.jaz.email}">Odstrani</button>
      </div>`
  } else if (jazNePridem) {
    opomba = `
      <p class="opomba opomba-manjka">Imaš zamenjavo? Vpiši jo tukaj:</p>
      <form class="zamenjava-obrazec moj-obrazec" data-email="${s.jaz.email}">
        <input id="moja-zamenjava" name="ime" placeholder="Ime zamenjave" autocomplete="off">
        <button class="gumb-majhen" type="submit">Shrani</button>
      </form>`
  }

  return `
    <section class="kartica junak">
      <div class="junak-oznaka">Naslednji termin</div>
      <div class="junak-datum">${lepDatum(s.cetrtek)}</div>
      <div class="junak-kraj">20.30 · Dvorana Vižmarje-Brod</div>
      <div class="stevec">
        <div class="stevec-stevilka"><b>${pride}</b><span>/${vseh}</span></div>
        <div class="znacka ${manjka ? 'znacka-manjka' : 'znacka-polno'}">
          ${manjka ? `Manjka ${manjka}` : 'Ekipa je polna'}
        </div>
      </div>
      <div class="napredek ${manjka ? 'napredek-manjka' : ''}"><div style="width:${odstotek}%"></div></div>
      <div class="povzetek">
        <span class="p-da">✓ ${pride} pride</span>
        <span class="p-ne">✕ ${nePride} ne more</span>
        <span class="p-brez">? ${brez} brez odgovora</span>
      </div>
    </section>

    <section class="kartica ${!moj ? 'cakam-odgovor' : ''}">
      <div class="moj-naslov">${!moj ? 'Ali prideš v četrtek? Potrdi prihod.' : 'Ali prideš v četrtek?'}</div>
      <div class="preklop">
        <button class="${jazPridem ? 'izbran da' : ''}" data-akcija="pridem">✓ Pridem</button>
        <button class="${jazNePridem ? 'izbran ne' : ''}" data-akcija="nepridem">✕ Ne morem</button>
      </div>
      ${opomba}
    </section>

    <h2 class="naslov-sekcije">Igralci</h2>
    <ul class="seznam">
      ${s.igralci.map(htmlIgralec).join('')}
    </ul>
  `
}

function htmlIgralec(i) {
  const p = s.prisotnost[i.email]
  const pride = p?.status === 'pride'
  const nePride = p?.status === 'ne_pride'
  const namestnik = p?.namestnik || ''
  const razred = pride ? 'pride' : !nePride ? 'brez' : namestnik ? 'zamenjava' : 'manjka'
  const jeJaz = i.email === s.jaz.email

  let status
  if (pride) status = 'Pride'
  else if (!nePride) status = 'Še ni potrdil'
  else if (namestnik) status = `Namesto pride <b>${varno(namestnik)}</b>`
  else status = 'Ne pride · iščemo zamenjavo'

  let desno
  if (pride) desno = '<span class="pika"></span>'
  else if (!nePride) desno = '<span class="pika pika-brez"></span>'
  else if (namestnik) desno = `<button class="gumb-majhen sekundarni" data-akcija="brisiZamenjavo" data-email="${i.email}">Odstrani</button>`
  else if (s.odprtaZamenjava === i.email) desno = ''
  else desno = `<button class="gumb-majhen" data-akcija="odpriZamenjavo" data-email="${i.email}">+ Zamenjava</button>`

  const obrazec = s.odprtaZamenjava === i.email ? `
    <form class="zamenjava-obrazec" data-email="${i.email}">
      <input id="zam-${i.email}" name="ime" placeholder="Ime zamenjave" autocomplete="off">
      <button class="gumb-majhen" type="submit">Shrani</button>
      <button class="gumb-majhen sekundarni" type="button" data-akcija="zapriZamenjavo">✕</button>
    </form>` : ''

  return `
    <li class="igralec ${razred}">
      ${avatar(i.ime)}
      <div class="igralec-info">
        <div class="igralec-ime">${varno(i.ime)}${jeJaz ? '<span class="oznaka">ti</span>' : ''}</div>
        <div class="igralec-status">${status}</div>
      </div>
      ${desno}
      ${obrazec}
    </li>
  `
}

function htmlIgralci() {
  const aktivnih = s.vsiIgralci.filter(i => i.aktiven).length
  return `
    <section class="kartica">
      <h2>Dodaj igralca</h2>
      <form id="dodajObrazec" class="obrazec">
        <input name="ime" placeholder="Ime in priimek" autocomplete="off">
        <input name="email" type="email" placeholder="Gmail naslov" autocomplete="off">
        <button class="gumb gumb-glavni" type="submit">Dodaj igralca</button>
        <p class="napaka" id="adminNapaka"></p>
      </form>
    </section>

    <h2 class="naslov-sekcije">Vsi igralci · ${aktivnih} aktivnih</h2>
    <ul class="seznam">
      ${s.vsiIgralci.map(i => `
        <li class="igralec ${i.aktiven ? '' : 'neaktiven'}">
          ${avatar(i.ime)}
          <div class="igralec-info">
            <div class="igralec-ime">${varno(i.ime)}</div>
            <div class="igralec-status">${varno(i.email)}</div>
          </div>
          ${i.vloga === 'admin'
            ? '<span class="oznaka oznaka-admin">admin</span>'
            : `<button class="gumb-majhen sekundarni" data-akcija="preklopiAktiven" data-email="${i.email}">${i.aktiven ? 'Izklopi' : 'Vklopi'}</button>`}
        </li>`).join('')}
    </ul>
  `
}

// ---------- DOGODKI ----------
app.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-akcija]')
  if (!el || !s.jaz) return
  const akcija = el.dataset.akcija
  const email = el.dataset.email
  const ref = (em) => doc(db, 'termini', s.id, 'prisotnost', em)
  const zdaj = { vpisal: s.jaz.ime, cas: new Date() }

  try {
    if (akcija === 'odjava') {
      signOut(auth)
    } else if (akcija === 'pogled') {
      s.pogled = el.dataset.pogled
      render()
    } else if (akcija === 'nepridem') {
      if (s.prisotnost[s.jaz.email]?.status === 'ne_pride') return
      await setDoc(ref(s.jaz.email), { status: 'ne_pride', namestnik: '', ...zdaj })
    } else if (akcija === 'pridem') {
      const moj = s.prisotnost[s.jaz.email]
      if (moj?.status === 'pride') return
      if (moj?.namestnik && !confirm(`Zamenjava ${moj.namestnik} bo odstranjena. Nadaljujem?`)) return
      await setDoc(ref(s.jaz.email), { status: 'pride', namestnik: '', ...zdaj })
    } else if (akcija === 'odpriZamenjavo') {
      s.odprtaZamenjava = email
      render()
    } else if (akcija === 'zapriZamenjavo') {
      s.odprtaZamenjava = null
      render()
    } else if (akcija === 'brisiZamenjavo') {
      if (!confirm('Odstranim zamenjavo?')) return
      await updateDoc(ref(email), { namestnik: '', ...zdaj })
    } else if (akcija === 'preklopiAktiven') {
      const igr = s.vsiIgralci.find(i => i.email === email)
      await updateDoc(doc(db, 'igralci', email), { aktiven: !igr.aktiven })
      await naloziIgralce()
      render()
    }
  } catch (napaka) {
    alert('Napaka: ' + napaka.code)
  }
})

app.addEventListener('submit', async (e) => {
  e.preventDefault()
  const f = e.target

  try {
    if (f.classList.contains('zamenjava-obrazec')) {
      const ime = f.ime.value.trim()
      if (!ime) return
      s.odprtaZamenjava = null
      f.ime.value = ''
      await updateDoc(doc(db, 'termini', s.id, 'prisotnost', f.dataset.email), {
        namestnik: ime, vpisal: s.jaz.ime, cas: new Date()
      })
    } else if (f.id === 'dodajObrazec') {
      const ime = f.ime.value.trim()
      const email = f.email.value.trim().toLowerCase()
      if (!ime || !email.includes('@')) {
        f.querySelector('#adminNapaka').textContent = 'Vpiši ime in veljaven e-naslov.'
        return
      }
      await setDoc(doc(db, 'igralci', email), { ime, vloga: 'igralec', aktiven: true })
      await naloziIgralce()
      render()
    }
  } catch (napaka) {
    alert('Napaka: ' + napaka.code)
  }
})

// ---------- ZAGON ----------
onAuthStateChanged(auth, async (user) => {
  if (ustaviPoslusanje) {
    ustaviPoslusanje()
    ustaviPoslusanje = null
  }
  s.jaz = null
  if (!user) {
    prikaziPrijavo()
    return
  }
  app.innerHTML = '<div class="nalagam"><span class="vrtavka"></span></div>'
  try {
    const snap = await getDoc(doc(db, 'igralci', user.email.toLowerCase()))
    if (snap.exists() && snap.data().aktiven) {
      await zacniAplikacijo(user, snap.data())
    } else {
      prikaziNiDostopa(user)
    }
  } catch (napaka) {
    console.error(napaka)
    prikaziNiDostopa(user)
  }
})
