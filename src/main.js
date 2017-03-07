const qs = document.querySelector.bind(document)

const stateBar = qs('#state')

// hook up the url to something that was submitted
const url_field = qs('[name=url]')
const search = location.search||''
const match = search.match(/[?&]url=(.*)[&#]?/)
url_field.value = match ? unescape(match[1]) : '';

const submit = qs('[type=submit]')

url_field.addEventListener('keyup', () => {
  form.dataset.state = ''
  stateBar.className = ''
})

const form = qs('form')
form.addEventListener('submit', (e) => {
  e.preventDefault()

  // connect
  url_field.disabled = true
  submit.value = 'Connecting'

  connect()
    .then(() => {
      // display the new ui, hide this one
    })
    .catch(() => {
      // display error
      form.dataset.state = 'error'
      url_field.disabled = false
      stateBar.className = 'error'
      submit.value = 'Connect'
    })

  // update the url for reloads
  history.pushState({},document.name,`?url=${escape(url_field.value)}`)
}, false)



const connect = () => {
  return new Promise((accept, reject) => {
    setTimeout(reject, 1000)
  })
}
