console.log('hello')

const qs = document.querySelector.bind(document)

// hook up the url to something that was submitted
const url_field = qs('[name=url]')
const search = location.search||''
const match = search.match(/[?&]url=(.*)[&#]?/)
url_field.value = match ? unescape(match[1]) : ''
