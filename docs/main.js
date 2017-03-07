var qs = document.querySelector.bind(document);

var stateBar = qs('#state');

// hook up the url to something that was submitted
var url_field = qs('[name=url]');
var search = location.search||'';
var match = search.match(/[?&]url=(.*)[&#]?/);
url_field.value = match ? unescape(match[1]) : '';

var submit = qs('[type=submit]');

url_field.addEventListener('keyup', function () {
  form.dataset.state = '';
  stateBar.className = '';
});

var form = qs('form');
form.addEventListener('submit', function (e) {
  e.preventDefault();

  // connect
  url_field.disabled = true;
  submit.value = 'Connecting';

  connect()
    .then(function () {
      // display the new ui, hide this one
    })
    .catch(function () {
      // display error
      form.dataset.state = 'error';
      url_field.disabled = false;
      stateBar.className = 'error';
      submit.value = 'Connect';
    });

  // update the url for reloads
  history.pushState({},document.name,("?url=" + (escape(url_field.value))));
}, false);



var connect = function () {
  return new Promise(function (accept, reject) {
    setTimeout(reject, 1000);
  })
};
