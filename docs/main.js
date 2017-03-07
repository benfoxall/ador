console.log('hello');

var qs = document.querySelector.bind(document);

// hook up the url to something that was submitted
var url_field = qs('[name=url]');
var search = location.search||'';
var match = search.match(/[?&]url=(.*)[&#]?/);
url_field.value = match ? unescape(match[1]) : '';
