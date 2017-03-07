function appendNode ( node, target ) {
	target.appendChild( node );
}

function insertNode ( node, target, anchor ) {
	target.insertBefore( node, anchor );
}

function detachNode ( node ) {
	node.parentNode.removeChild( node );
}

function createElement ( name ) {
	return document.createElement( name );
}

function createText ( data ) {
	return document.createTextNode( data );
}

function addEventListener ( node, event, handler ) {
	node.addEventListener ( event, handler, false );
}

function removeEventListener ( node, event, handler ) {
	node.removeEventListener ( event, handler, false );
}

function setAttribute ( node, attribute, value ) {
	node.setAttribute ( attribute, value );
}

function get ( key ) {
	return key ? this._state[ key ] : this._state;
}

function fire ( eventName, data ) {
	var handlers = eventName in this._handlers && this._handlers[ eventName ].slice();
	if ( !handlers ) return;

	for ( var i = 0; i < handlers.length; i += 1 ) {
		handlers[i].call( this, data );
	}
}

function observe ( key, callback, options ) {
	var group = ( options && options.defer ) ? this._observers.pre : this._observers.post;

	( group[ key ] || ( group[ key ] = [] ) ).push( callback );

	if ( !options || options.init !== false ) {
		callback.__calling = true;
		callback.call( this, this._state[ key ] );
		callback.__calling = false;
	}

	return {
		cancel: function () {
			var index = group[ key ].indexOf( callback );
			if ( ~index ) group[ key ].splice( index, 1 );
		}
	};
}

function on ( eventName, handler ) {
	var handlers = this._handlers[ eventName ] || ( this._handlers[ eventName ] = [] );
	handlers.push( handler );

	return {
		cancel: function () {
			var index = handlers.indexOf( handler );
			if ( ~index ) handlers.splice( index, 1 );
		}
	};
}

function set ( newState ) {
	this._set( newState );
	( this._root || this )._flush();
}

function _flush () {
	if ( !this._renderHooks ) return;

	while ( this._renderHooks.length ) {
		var hook = this._renderHooks.pop();
		hook.fn.call( hook.context );
	}
}

function dispatchObservers ( component, group, newState, oldState ) {
	for ( var key in group ) {
		if ( !( key in newState ) ) continue;

		var newValue = newState[ key ];
		var oldValue = oldState[ key ];

		if ( newValue === oldValue && typeof newValue !== 'object' ) continue;

		var callbacks = group[ key ];
		if ( !callbacks ) continue;

		for ( var i = 0; i < callbacks.length; i += 1 ) {
			var callback = callbacks[i];
			if ( callback.__calling ) continue;

			callback.__calling = true;
			callback.call( component, newValue, oldValue );
			callback.__calling = false;
		}
	}
}

function applyComputations ( state, newState, oldState, isInitial ) {
	if ( isInitial || ( 'state' in newState && typeof state.state === 'object' || state.state !== oldState.state ) ) {
		state.disabled = newState.disabled = template.computed.disabled( state.state );
	}
	
	if ( isInitial || ( 'state' in newState && typeof state.state === 'object' || state.state !== oldState.state ) ) {
		state.submit_text = newState.submit_text = template.computed.submit_text( state.state );
	}
}

var template = (function () {

var search = location.search||'';
var match = search.match(/[?&]url=(.*)[&#]?/);
var initialURL = match ? unescape(match[1]) : '';

var template = {
  data: function data () {
    return {
      url: initialURL,
      state: 'ready'
    }
  },

  computed: {
    disabled: function (state) { return state == 'connecting'; },
    submit_text: function (state) { return state == 'connecting' ? 'Connecting' : 'Connect'; }
  },

  methods: {
    connect: function connect$1(e) {
      var this$1 = this;

      e.preventDefault();

      if(this.get('state') == 'connecting') { return }

      this.set({state: 'connecting'});

      connect()
        .then(function () {
          this$1.set({state: 'connected'});
          this$1.fire('connected');
        }, function () {
          this$1.set({state: 'error'});
        });

      // update the url for reloads
      history.pushState(
        {},document.name,
        ("?url=" + (escape(this.get('url'))))
      );
    },
    keyup: function keyup(e) {
      if(this.get('state') == 'error') {
        this.set({state: 'ready'});
      }

    }
  }
};


var connect = function () {
  return new Promise(function (accept, reject) {
    setTimeout(reject, 1000);
  })
};



return template;


}());

var addedCss = false;
function addCss () {
	var style = createElement( 'style' );
	style.textContent = "\n\n  [svelte-3804194536]#url, [svelte-3804194536] #url {\n    transition: .2s\n  }\n\n  [svelte-3804194536]#submit, [svelte-3804194536] #submit {\n    color: inherit;\n    border: none;\n    background: none;\n    padding:0;\n    text-decoration: underline;\n    cursor: pointer;\n    transition: .2s\n  }\n  [svelte-3804194536]#submit:hover, [svelte-3804194536] #submit:hover {\n    color: #08f\n  }\n\n  [svelte-3804194536]#root.error #url, [svelte-3804194536] #root.error #url{\n    color: #f00\n  }\n  [svelte-3804194536]#root.error #submit, [svelte-3804194536] #root.error #submit{\n    color: #f00\n  }\n\n  [svelte-3804194536]#state, [svelte-3804194536] #state {\n    height: 10px;\n    background: #ccc;\n    margin-bottom: 1em;\n    transition: 1s;\n    border-radius: 0 0 2px 2px;\n  }\n\n  [svelte-3804194536]#state, [svelte-3804194536] #state {\n    background: #ccc;\n  }\n\n  [svelte-3804194536]#root.connecting #state, [svelte-3804194536] #root.connecting #state {\n    background: #000\n  }\n\n  [svelte-3804194536]#root.connected #state, [svelte-3804194536] #root.connected #state{\n    background: aquamarine\n  }\n\n  [svelte-3804194536]#root.connected #connection, [svelte-3804194536] #root.connected #connection {\n    display:none\n  }\n\n";
	appendNode( style, document.head );

	addedCss = true;
}

function renderMainFragment ( root, component ) {
	var div = createElement( 'div' );
	setAttribute( div, 'svelte-3804194536', '' );
	div.id = "root";
	var last_div_class = root.state;
	div.className = last_div_class;
	
	var div1 = createElement( 'div' );
	setAttribute( div1, 'svelte-3804194536', '' );
	div1.id = "state";
	
	appendNode( div1, div );
	appendNode( createText( "\n\n  " ), div );
	
	var form = createElement( 'form' );
	setAttribute( form, 'svelte-3804194536', '' );
	form.id = "connection";
	
	function submitHandler ( event ) {
		component.connect(event);
	}
	
	addEventListener( form, 'submit', submitHandler );
	
	var last_form_class = root.state;
	form.className = last_form_class;
	
	appendNode( form, div );
	
	var input = createElement( 'input' );
	setAttribute( input, 'svelte-3804194536', '' );
	input.id = "url";
	input.type = "url";
	input.placeholder = "mqtt://url";
	
	var input_updating = false;
	
	function inputChangeHandler () {
		input_updating = true;
		component._set({ url: input.value });
		input_updating = false;
	}
	
	addEventListener( input, 'input', inputChangeHandler );
	
	function keyupHandler ( event ) {
		component.keyup();
	}
	
	addEventListener( input, 'keyup', keyupHandler );
	
	var input_updating = false;
	
	function inputChangeHandler1 () {
		input_updating = true;
		component._set({ disabled: input.disabled });
		input_updating = false;
	}
	
	addEventListener( input, 'input', inputChangeHandler1 );
	
	appendNode( input, form );
	
	input.disabled = root.disabled;
	
	appendNode( createText( "\n    " ), form );
	
	var input1 = createElement( 'input' );
	setAttribute( input1, 'svelte-3804194536', '' );
	input1.id = "submit";
	input1.type = "submit";
	
	var input1_updating = false;
	
	function input1ChangeHandler () {
		input1_updating = true;
		component._set({ submit_text: input1.value });
		input1_updating = false;
	}
	
	addEventListener( input1, 'input', input1ChangeHandler );
	
	appendNode( input1, form );
	
	input1.value = root.submit_text;

	return {
		mount: function ( target, anchor ) {
			insertNode( div, target, anchor );
		},
		
		update: function ( changed, root ) {
			var __tmp;
		
			if ( ( __tmp = root.state ) !== last_div_class ) {
				last_div_class = __tmp;
				div.className = last_div_class;
			}
			
			if ( ( __tmp = root.state ) !== last_form_class ) {
				last_form_class = __tmp;
				form.className = last_form_class;
			}
			
			if ( !input_updating ) {
							input.value = root.url;
						}
			if ( !input_updating ) {
							input.disabled = root.disabled;
						}
			
			if ( !input1_updating ) {
							input1.value = root.submit_text;
						}
		},
		
		teardown: function ( detach ) {
			removeEventListener( form, 'submit', submitHandler );
			removeEventListener( input, 'input', inputChangeHandler );
			removeEventListener( input, 'keyup', keyupHandler );
			removeEventListener( input, 'input', inputChangeHandler1 );
			removeEventListener( input1, 'input', input1ChangeHandler );
			
			if ( detach ) {
				detachNode( div );
			}
		}
	};
}

function Connection ( options ) {
	options = options || {};
	this._state = Object.assign( template.data(), options.data );
	applyComputations( this._state, this._state, {}, true );
	
	this._observers = {
		pre: Object.create( null ),
		post: Object.create( null )
	};
	
	this._handlers = Object.create( null );
	
	this._root = options._root;
	this._yield = options._yield;
	
	this._torndown = false;
	if ( !addedCss ) { addCss(); }
	
	this._fragment = renderMainFragment( this._state, this );
	if ( options.target ) { this._fragment.mount( options.target, null ); }
}

Connection.prototype = template.methods;

Connection.prototype.get = get;
Connection.prototype.fire = fire;
Connection.prototype.observe = observe;
Connection.prototype.on = on;
Connection.prototype.set = set;
Connection.prototype._flush = _flush;

Connection.prototype._set = function _set ( newState ) {
	var oldState = this._state;
	this._state = Object.assign( {}, oldState, newState );
	applyComputations( this._state, newState, oldState, false );
	
	dispatchObservers( this, this._observers.pre, newState, oldState );
	if ( this._fragment ) { this._fragment.update( newState, this._state ); }
	dispatchObservers( this, this._observers.post, newState, oldState );
};

Connection.prototype.teardown = Connection.prototype.destroy = function destroy ( detach ) {
	this.fire( 'teardown' );

	this._fragment.teardown( detach !== false );
	this._fragment = null;

	this._state = {};
	this._torndown = true;
};

var connection = new Connection({
  target: document.querySelector('body')
});

connection.on('connected', function () {
  console.log("Connected");
});
