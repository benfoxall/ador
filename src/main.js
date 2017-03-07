import Connection from './Connection.html'

const connection = new Connection({
  target: document.querySelector('body')
})

connection.on('connected', () => {
  console.log("Connected")
})
