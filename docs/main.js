// import Connection from './Connection.html'
//
// const connection = new Connection({
//   target: document.querySelector('header')
// })
//
// connection.on('connected', (client) => {
//
//   console.log("Connected", client)
//
//   document.body.addEventListener('click', (e) => {
//     e.preventDefault()
//     const v = ~~(Math.random()*255)
//     client.publish('/debug/press', v)
//   }, false)
//
//   client.subscribe('/debug/press')
//
//   client.on('message', (topic, buffer) => {
//     const payload = buffer.toString()
//     console.log("message:", topic, payload)
//
//     document.body.style.backgroundColor =
//       `hsl(${payload}, 50%, 50%)`
//   })
//
// })



var sections = Array.from(
  document.querySelectorAll('li[tabindex]')
);

sections.forEach(function(section){
  section.addEventListener('focus', function () {
    section.className = 'active';
    // setFocus(section)
  }, false);

  section.addEventListener('blur', function () {
    section.className = '';
  }, false);
});
