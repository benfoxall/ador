import mqtt from '../node_modules/mqtt/dist/mqtt.min.js'

const qs = document.querySelector.bind(document)

// todo: use session store
const clientId = `c_${Math.random().toString(16).substr(2, 6)}`


/* todo - choose host from url.

Rules:
  ?a - wss://iot.benjaminbenben.eu
  ?b - wss://test.mosquitto.org:8081
  ?192.168.0.42 - wss://192.168.0.1
  ?192.168.0.42:8081 - wss://192.168.0.1:8081
*/
var client  = mqtt.connect('wss://iot.benjaminbenben.eu', {clientId})

// keep track of packets sent and received
let up = 0, dn = 0
const $up = qs('#up'), $dn = qs('#dn')
client.on('packetsend', () => $up.innerText = '↑'+(++up))
client.on('packetreceive', () => $dn.innerText = '↓'+(++dn))


const sections = [].slice.call(document.querySelectorAll('li[tabindex]'), 0)

sections.forEach(function(section){
  section.addEventListener('focus', () => {
    section.className = 'active'
  }, false)

  section.addEventListener('blur', () => {
    section.className = ''
  }, false)
})


let touches = 0
qs('#touch').addEventListener('click', (e) => {
  e.preventDefault()
  client.publish(`/phone/${clientId}/touches`, 't-'+(++touches))
}, false)
qs('#touch').addEventListener('touchstart', (e) => {
  e.preventDefault()
  client.publish(`/phone/${clientId}/touches`, 't-'+(++touches))
}, false)
