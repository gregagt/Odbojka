import './style.css'
import { app } from './firebase.js'

document.querySelector('#app').innerHTML = `
  <h1>Odbojka</h1>
  <p>Povezan s Firebase projektom: <b>${app.options.projectId}</b></p>
  `