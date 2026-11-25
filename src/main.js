import './style.css'
import { auth, db } from './firebase.js'
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth'
import {
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, onSnapshot
} from 'firebase/firestore'

const app = document.querySelector('#app')
const PRAVILA_URL = 'https://sport-rodica.splet.arnes.si/igre-z-zogo/odbojka/'
const ikonaPravila = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><path d="M9 7h7M9 11h5"/></svg>`
const gumbPravila = `<a class="gumb-pravila" href="${PRAVILA_URL}" target="_blank" rel="noopener">${ikonaPravila}<span>Pravila</span></a>`
const provider = new GoogleAuthProvider()
let ustaviPoslusanje = null
let ustaviTermin = null

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
  odprtaZamenjava: null,  // email igralca, kjer je odprt vnos zamenjave
  urejam: null,           // email igralca, ki ga admin ureja
  telefoni: {},           // email -> telefonska številka (samo admin)
  smsBesedilo: '',
  smsOdpoved: '',
  termin: {},             // podatki termina (npr. odpade)
  napakaObvestila: ''
}

const PRIVZETO_SMS = 'Hej! 🏐 Ne pozabi potrditi prihoda na odbojko v četrtek ob 20.30: https://odbojka-brod.pages.dev'
const PRIVZETO_ODPOVED = 'Pozor! 🏐 Odbojka ta četrtek ODPADE. Lep pozdrav!'

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

function kratekCas(cas) {
  const d = cas?.toDate ? cas.toDate() : null
  if (!d) return ''
  const dan = d.toLocaleDateString('sl-SI', { weekday: 'short' })
  const ura = d.toLocaleTimeString('sl-SI', { hour: '2-digit', minute: '2-digit' })
  return `${dan} ${ura}`
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
// Messenger, Facebook, Instagram ... imajo vgrajen brskalnik, kjer Google prijava ne deluje
function vgrajenBrskalnik() {
  const ua = navigator.userAgent || ''
  return /FBAN|FBAV|FB_IAB|FBIOS|Messenger|Instagram|Line\/|MicroMessenger|; wv\)/i.test(ua)
}

function prikaziPrijavo() {
  const android = /Android/i.test(navigator.userAgent)
  const naslov = location.host + location.pathname

  if (vgrajenBrskalnik()) {
    app.innerHTML = `
      <div class="prijava">
        <img class="logo" src="/zoga.svg" alt="">
        <h1>Odbojka</h1>
        <div class="kartica opozorilo-brskalnik">
          <p><b>Stran je odprta v Messengerju.</b></p>
          <p>Prijava z Googlom tukaj ne deluje. Odpri stran v pravem brskalniku:</p>
          ${android
            ? `<a class="gumb gumb-glavni" href="intent://${naslov}#Intent;scheme=https;package=com.android.chrome;end">Odpri v Chromu</a>
               <p class="opomba">Če gumb ne deluje: zgoraj desno tapni <b>⋮</b> in izberi <b>Odpri v brskalniku</b>.</p>`
            : `<p class="opomba">Tapni <b>⋯</b> (spodaj ali zgoraj desno) in izberi <b>Odpri v Safariju</b> / <b>Odpri v brskalniku</b>.</p>`}
          <button class="gumb gumb-sekundarni" id="kopiraj">Kopiraj povezavo</button>
        </div>
        ${gumbPravila}
      </div>
    `
    document.querySelector('#kopiraj').onclick = async (e) => {
      try {
        await navigator.clipboard.writeText('https://' + naslov)
        e.target.textContent = 'Kopirano ✓ – prilepi v Chrome ali Safari'
      } catch {
        e.target.textContent = 'https://' + naslov
      }
    }
    return
  }

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

  ustaviTermin = onSnapshot(doc(db, 'termini', s.id), (snap) => {
    s.termin = snap.exists() ? snap.data() : {}
    render()
  })
}

async function naloziIgralce() {
  const snap = await getDocs(collection(db, 'igralci'))
  s.vsiIgralci = snap.docs
    .map(d => ({ email: d.id, ...d.data() }))
    .sort((a, b) => a.ime.localeCompare(b.ime, 'sl'))
  s.igralci = s.vsiIgralci.filter(i => i.aktiven)
  if (s.jaz?.vloga === 'admin') await naloziObvestila()
}

async function naloziObvestila() {
  try {
    const snap = await getDocs(collection(db, 'telefoni'))
    s.telefoni = {}
    snap.forEach(d => { s.telefoni[d.id] = d.data().telefon || '' })
    const nast = await getDoc(doc(db, 'nastavitve', 'obvestila'))
    s.smsBesedilo = (nast.exists() && nast.data().smsBesedilo) || PRIVZETO_SMS
    s.smsOdpoved = (nast.exists() && nast.data().smsOdpoved) || PRIVZETO_ODPOVED
    s.napakaObvestila = ''
  } catch (e) {
    s.smsBesedilo = s.smsBesedilo || PRIVZETO_SMS
    s.smsOdpoved = s.smsOdpoved || PRIVZETO_ODPOVED
    s.napakaObvestila = 'Telefonskih številk ni mogoče prebrati (' + e.code + '). Preveri, ali so objavljena nova pravila v Firestore.'
  }
}

function urediTelefon(t) {
  let n = String(t || '').replace(/[^\d+]/g, '')
  if (!n) return ''
  if (n.startsWith('00')) n = '+' + n.slice(2)
  else if (n.startsWith('0')) n = '+386' + n.slice(1)
  else if (!n.startsWith('+')) n = '+386' + n
  return n
}

async function shraniTelefon(email, telefon) {
  if (telefon === (s.telefoni[email] || '')) return
  if (telefon) await setDoc(doc(db, 'telefoni', email), { telefon })
  else await deleteDoc(doc(db, 'telefoni', email))
  s.telefoni[email] = telefon
}

function smsHref(komu) {
  const seznam = komu === 'neodgovorjeni' ? s.igralci.filter(i => !s.prisotnost[i.email]) : s.igralci
  const stevilke = seznam.map(i => s.telefoni[i.email]).filter(Boolean)
  const besedilo = komu === 'odpoved' ? s.smsOdpoved : s.smsBesedilo
  return stevilke.length ? smsPovezava(stevilke, besedilo) : '#'
}

function smsPovezava(stevilke, besedilo) {
  const telo = encodeURIComponent(besedilo)
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent)
  if (ios) {
    return stevilke.length > 1
      ? `sms:/open?addresses=${stevilke.join(',')}&body=${telo}`
      : `sms:${stevilke[0]}&body=${telo}`
  }
  return `sms:${stevilke.join(',')}?body=${telo}`
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
        <button class="${s.pogled === 'obvestila' ? 'aktiven' : ''}" data-akcija="pogled" data-pogled="obvestila">Obvestila</button>
      </nav>` : ''}
    <main>
      ${!jeAdmin || s.pogled === 'termin' ? htmlTermin()
        : s.pogled === 'igralci' ? htmlIgralci() : htmlObvestila()}
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

  const odpade = s.termin?.odpade
  const jeAdmin = s.jaz.vloga === 'admin'
  const pasica = odpade ? `
    <section class="odpade-pasica">
      <div class="odpade-naslov">✕ TERMIN ODPADE</div>
      <div class="odpade-opis">${lepDatum(s.cetrtek)} odbojke ni.${s.termin.odpovedal ? ` Odpovedal: ${varno(s.termin.odpovedal)}.` : ''}</div>
      ${jeAdmin ? '<button class="odpade-preklic" data-akcija="prekliciOdpoved">Prekliči odpoved</button>' : ''}
    </section>` : ''

  return `
    ${pasica}
    <div class="${odpade ? 'odpadlo' : ''}">
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
    </div>
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

  // kdo je potrdil
  let vpis = ''
  if (p?.vpisal) {
    const kdo = p.vpisal === i.ime ? 'sam' : varno(p.vpisal)
    const cas = kratekCas(p.cas)
    vpis = `<div class="igralec-vpis">potrdil: ${kdo}${cas ? ' · ' + cas : ''}</div>`
  }

  // zamenjava
  let zamenjava = ''
  if (nePride && namestnik) {
    zamenjava = `<button class="povezava" data-akcija="brisiZamenjavo" data-email="${i.email}">odstrani zamenjavo</button>`
  } else if (nePride && s.odprtaZamenjava !== i.email) {
    zamenjava = `<button class="povezava povezava-poudarek" data-akcija="odpriZamenjavo" data-email="${i.email}">+ vpiši zamenjavo</button>`
  }

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
        ${vpis}
        ${zamenjava}
      </div>
      <div class="mini-preklop">
        <button class="${pride ? 'izbran da' : ''}" data-akcija="pridem" data-email="${i.email}" title="Pride">✓</button>
        <button class="${nePride ? 'izbran ne' : ''}" data-akcija="nepridem" data-email="${i.email}" title="Ne pride">✕</button>
      </div>
      ${obrazec}
    </li>
  `
}

function htmlObvestila() {
  const neodgovorjeni = s.igralci.filter(i => !s.prisotnost[i.email])
  const sTel = (seznam) => seznam.filter(i => s.telefoni[i.email])
  const nNeodg = sTel(neodgovorjeni).length
  const nVsi = sTel(s.igralci).length

  return `
    ${s.napakaObvestila ? `<p class="opozorilo">${varno(s.napakaObvestila)}</p>` : ''}
    <section class="kartica">
      <h2>SMS opomnik</h2>
      <textarea id="sms-besedilo" class="sms-besedilo" rows="4">${varno(s.smsBesedilo)}</textarea>
      <div class="sms-gumbi">
        <a class="gumb gumb-glavni sms-gumb ${nNeodg ? '' : 'onemogocen'}" data-komu="neodgovorjeni" href="${smsHref('neodgovorjeni')}">
          📱 SMS neprijavljenim (${nNeodg})
        </a>
        <a class="gumb gumb-sekundarni sms-gumb ${nVsi ? '' : 'onemogocen'}" data-komu="vsi" href="${smsHref('vsi')}">
          📱 SMS vsem (${nVsi})
        </a>
        <button class="povezava" data-akcija="shraniBesedilo">Shrani besedilo kot privzeto</button>
      </div>
      <p class="opomba">Gumb odpre aplikacijo za SMS na tvojem telefonu z vsemi prejemniki in besedilom. Pošlješ sam. Deluje samo na telefonu.</p>
      ${neodgovorjeni.length ? `<p class="opomba">Še niso odgovorili: ${neodgovorjeni.map(i => varno(i.ime)).join(', ')}</p>` : ''}
    </section>

    <section class="kartica kartica-odpoved">
      <h2>Odpoved termina</h2>
      ${s.termin?.odpade ? `
        <p class="opomba opomba-odpoved">Termin ${lepDatum(s.cetrtek).toLowerCase()} je označen kot <b>odpovedan</b>. Igralci to vidijo v aplikaciji.</p>
        <textarea id="sms-odpoved" class="sms-besedilo" rows="3">${varno(s.smsOdpoved)}</textarea>
        <div class="sms-gumbi">
          <a class="gumb gumb-rdec sms-gumb ${nVsi ? '' : 'onemogocen'}" data-komu="odpoved" href="${smsHref('odpoved')}">
            📱 Pošlji SMS o odpovedi vsem (${nVsi})
          </a>
          <button class="gumb gumb-sekundarni" data-akcija="prekliciOdpoved">Prekliči odpoved</button>
          <button class="povezava" data-akcija="shraniBesedilo">Shrani besedilo kot privzeto</button>
        </div>` : `
        <p class="opomba">Če termin ${lepDatum(s.cetrtek).toLowerCase()} odpade, ga označi kot odpovedanega. Vsi igralci bodo v aplikaciji videli rdeče obvestilo, nato pa lahko pošlješ še SMS vsem.</p>
        <textarea id="sms-odpoved" class="sms-besedilo" rows="3">${varno(s.smsOdpoved)}</textarea>
        <div class="sms-gumbi">
          <button class="gumb gumb-rdec" data-akcija="odpovej">✕ Odpovej termin</button>
        </div>`}
    </section>

    <p class="opomba">Telefonske številke imaš vpisane ${nVsi} od ${s.igralci.length}. Dodaš ali popraviš jih v zavihku <b>Igralci</b> (gumb Uredi).</p>
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
        <input name="telefon" type="tel" inputmode="tel" placeholder="Telefon (neobvezno), npr. 041 123 456" autocomplete="off">
        <button class="gumb gumb-glavni" type="submit">Dodaj igralca</button>
        <p class="napaka" id="adminNapaka"></p>
      </form>
    </section>

    <h2 class="naslov-sekcije">Vsi igralci · ${aktivnih} aktivnih</h2>
    <ul class="seznam">
      ${s.vsiIgralci.map(i => s.urejam === i.email ? `
        <li class="igralec urejanje">
          ${avatar(i.ime)}
          <form class="uredi-obrazec" data-email="${i.email}">
            <input id="uredi-ime" name="ime" value="${varno(i.ime)}" placeholder="Ime in priimek" autocomplete="off">
            <input id="uredi-email" name="email" type="email" value="${varno(i.email)}" placeholder="Gmail naslov" autocomplete="off">
            <input id="uredi-telefon" name="telefon" type="tel" inputmode="tel" value="${varno(s.telefoni[i.email] || '')}" placeholder="Telefon, npr. 041 123 456" autocomplete="off">
            <div class="uredi-gumbi">
              <button class="gumb-majhen" type="submit">Shrani</button>
              <button class="gumb-majhen sekundarni" type="button" data-akcija="prekliciUrejanje">Prekliči</button>
            </div>
            <p class="napaka" id="urediNapaka"></p>
          </form>
        </li>` : `
        <li class="igralec ${i.aktiven ? '' : 'neaktiven'}">
          ${avatar(i.ime)}
          <div class="igralec-info">
            <div class="igralec-ime">${varno(i.ime)}${i.vloga === 'admin' ? '<span class="oznaka oznaka-admin">admin</span>' : ''}</div>
            <div class="igralec-status">${varno(i.email)}</div>
            <div class="igralec-status">${s.telefoni[i.email] ? '📱 ' + varno(s.telefoni[i.email]) : '<span class="brez-tel">ni telefona</span>'}</div>
          </div>
          <div class="admin-gumbi">
            <button class="gumb-majhen sekundarni" data-akcija="urediIgralca" data-email="${i.email}">Uredi</button>
            ${i.vloga === 'admin' ? '' : `<button class="gumb-majhen sekundarni" data-akcija="preklopiAktiven" data-email="${i.email}">${i.aktiven ? 'Izklopi' : 'Vklopi'}</button>`}
          </div>
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
    } else if (akcija === 'nepridem' || akcija === 'pridem') {
      const kdo = email || s.jaz.email
      const nov = akcija === 'pridem' ? 'pride' : 'ne_pride'
      const zdajsnji = s.prisotnost[kdo]
      if (zdajsnji?.status === nov) {
        // ponoven klik na izbran gumb: odstrani odgovor
        if (zdajsnji.namestnik && !confirm(`Zamenjava ${zdajsnji.namestnik} bo odstranjena. Nadaljujem?`)) return
        await deleteDoc(ref(kdo))
        if (s.odprtaZamenjava === kdo) {
          s.odprtaZamenjava = null
          render()
        }
        return
      }
      const igr = s.igralci.find(i => i.email === kdo)
      if (kdo !== s.jaz.email && zdajsnji && zdajsnji.vpisal === igr?.ime &&
          !confirm(`${igr.ime} je sam izbral drugače. Vseeno spremenim?`)) return
      if (zdajsnji?.namestnik && !confirm(`Zamenjava ${zdajsnji.namestnik} bo odstranjena. Nadaljujem?`)) return
      await setDoc(ref(kdo), { status: nov, namestnik: '', ...zdaj })
      if (nov === 'ne_pride' && kdo !== s.jaz.email) {
        s.odprtaZamenjava = kdo
        render()
      }
    } else if (akcija === 'odpriZamenjavo') {
      s.odprtaZamenjava = email
      render()
    } else if (akcija === 'zapriZamenjavo') {
      s.odprtaZamenjava = null
      render()
    } else if (akcija === 'brisiZamenjavo') {
      if (!confirm('Odstranim zamenjavo?')) return
      await updateDoc(ref(email), { namestnik: '', ...zdaj })
    } else if (akcija === 'shraniBesedilo') {
      s.smsBesedilo = app.querySelector('#sms-besedilo').value.trim()
      s.smsOdpoved = app.querySelector('#sms-odpoved')?.value.trim() || s.smsOdpoved
      await setDoc(doc(db, 'nastavitve', 'obvestila'),
        { smsBesedilo: s.smsBesedilo, smsOdpoved: s.smsOdpoved }, { merge: true })
      alert('Besedilo shranjeno.')
    } else if (akcija === 'odpovej') {
      const dan = lepDatum(s.cetrtek).toLowerCase()
      if (!confirm(`Res odpoveš termin (${dan})?`)) return
      if (!confirm('Vsi igralci bodo videli, da termin ODPADE. Si prepričan, da to ni pomota?')) return
      s.smsOdpoved = app.querySelector('#sms-odpoved')?.value.trim() || s.smsOdpoved
      await setDoc(doc(db, 'termini', s.id),
        { odpade: true, odpovedal: s.jaz.ime, odpovedanoCas: new Date() }, { merge: true })
    } else if (akcija === 'prekliciOdpoved') {
      if (!confirm('Prekličem odpoved? Termin bo spet veljal.')) return
      await setDoc(doc(db, 'termini', s.id),
        { odpade: false, odpovedal: '', odpovedanoCas: null }, { merge: true })
    } else if (akcija === 'urediIgralca') {
      s.urejam = email
      render()
    } else if (akcija === 'prekliciUrejanje') {
      s.urejam = null
      render()
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

// sproti posodobi SMS povezave, ko se spreminja besedilo
app.addEventListener('input', (e) => {
  if (e.target.id === 'sms-odpoved') s.smsOdpoved = e.target.value
  else if (e.target.id === 'sms-besedilo') s.smsBesedilo = e.target.value
  else return
  app.querySelectorAll('.sms-gumb').forEach(a => { a.href = smsHref(a.dataset.komu) })
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
    } else if (f.classList.contains('uredi-obrazec')) {
      const star = f.dataset.email
      const ime = f.ime.value.trim()
      const email = f.email.value.trim().toLowerCase()
      const napaka = f.querySelector('#urediNapaka')
      if (!ime || !email.includes('@')) {
        napaka.textContent = 'Vpiši ime in veljaven e-naslov.'
        return
      }
      const igr = s.vsiIgralci.find(i => i.email === star)
      const telefon = urediTelefon(f.telefon.value)
      if (email === star) {
        await updateDoc(doc(db, 'igralci', star), { ime })
      } else {
        if (s.vsiIgralci.some(i => i.email === email)) {
          napaka.textContent = 'Igralec s tem e-naslovom že obstaja.'
          return
        }
        if (star === s.jaz.email) {
          napaka.textContent = 'Svojega e-naslova ne moreš spremeniti tukaj.'
          return
        }
        // e-naslov je ID zapisa: ustvari novega in izbriši starega
        await setDoc(doc(db, 'igralci', email), { ime, vloga: igr.vloga, aktiven: igr.aktiven })
        const p = s.prisotnost[star]
        if (p) {
          await setDoc(doc(db, 'termini', s.id, 'prisotnost', email), p)
          await deleteDoc(doc(db, 'termini', s.id, 'prisotnost', star))
        }
        if (s.telefoni[star]) {
          await deleteDoc(doc(db, 'telefoni', star))
          delete s.telefoni[star]
        }
        await deleteDoc(doc(db, 'igralci', star))
      }
      await shraniTelefon(email, telefon)
      s.urejam = null
      await naloziIgralce()
      render()
    } else if (f.id === 'dodajObrazec') {
      const ime = f.ime.value.trim()
      const email = f.email.value.trim().toLowerCase()
      if (!ime || !email.includes('@')) {
        f.querySelector('#adminNapaka').textContent = 'Vpiši ime in veljaven e-naslov.'
        return
      }
      await setDoc(doc(db, 'igralci', email), { ime, vloga: 'igralec', aktiven: true })
      await shraniTelefon(email, urediTelefon(f.telefon.value))
      await naloziIgralce()
      render()
    }
  } catch (napaka) {
    alert('Napaka: ' + napaka.code)
  }
})

// ---------- ZAGON ----------
onAuthStateChanged(auth, async (user) => {
  if (ustaviTermin) {
    ustaviTermin()
    ustaviTermin = null
  }
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
