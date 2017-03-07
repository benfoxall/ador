/*******************************************************************************
 * Copyright (c) 2013 IBM Corp.
 *
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * and Eclipse Distribution License v1.0 which accompany this distribution. 
 *
 * The Eclipse Public License is available at 
 *    http://www.eclipse.org/legal/epl-v10.html
 * and the Eclipse Distribution License is available at 
 *   http://www.eclipse.org/org/documents/edl-v10.php.
 *
 * Contributors:
 *    Andrew Banks - initial API and implementation and initial documentation
 *******************************************************************************/


// Only expose a single object name in the global namespace.
// Everything must go through this module. Global Paho.MQTT module
// only has a single public function, client, which returns
// a Paho.MQTT client object given connection details.
 
/**
 * Send and receive messages using web browsers.
 * <p> 
 * This programming interface lets a JavaScript client application use the MQTT V3.1 or
 * V3.1.1 protocol to connect to an MQTT-supporting messaging server.
 *  
 * The function supported includes:
 * <ol>
 * <li>Connecting to and disconnecting from a server. The server is identified by its host name and port number. 
 * <li>Specifying options that relate to the communications link with the server, 
 * for example the frequency of keep-alive heartbeats, and whether SSL/TLS is required.
 * <li>Subscribing to and receiving messages from MQTT Topics.
 * <li>Publishing messages to MQTT Topics.
 * </ol>
 * <p>
 * The API consists of two main objects:
 * <dl>
 * <dt><b>{@link Paho.MQTT.Client}</b></dt>
 * <dd>This contains methods that provide the functionality of the API,
 * including provision of callbacks that notify the application when a message
 * arrives from or is delivered to the messaging server,
 * or when the status of its connection to the messaging server changes.</dd>
 * <dt><b>{@link Paho.MQTT.Message}</b></dt>
 * <dd>This encapsulates the payload of the message along with various attributes
 * associated with its delivery, in particular the destination to which it has
 * been (or is about to be) sent.</dd>
 * </dl> 
 * <p>
 * The programming interface validates parameters passed to it, and will throw
 * an Error containing an error message intended for developer use, if it detects
 * an error with any parameter.
 * <p>
 * Example:
 * 
 * <code><pre>
client = new Paho.MQTT.Client(location.hostname, Number(location.port), "clientId");
client.onConnectionLost = onConnectionLost;
client.onMessageArrived = onMessageArrived;
client.connect({onSuccess:onConnect});

function onConnect() {
  // Once a connection has been made, make a subscription and send a message.
  console.log("onConnect");
  client.subscribe("/World");
  message = new Paho.MQTT.Message("Hello");
  message.destinationName = "/World";
  client.send(message); 
};
function onConnectionLost(responseObject) {
  if (responseObject.errorCode !== 0)
	console.log("onConnectionLost:"+responseObject.errorMessage);
};
function onMessageArrived(message) {
  console.log("onMessageArrived:"+message.payloadString);
  client.disconnect(); 
};	
 * </pre></code>
 * @namespace Paho.MQTT 
 */

if (typeof Paho === "undefined") {
	Paho = {};
}

Paho.MQTT = (function (global) {

	// Private variables below, these are only visible inside the function closure
	// which is used to define the module. 

	var version = "@VERSION@";
	var buildLevel = "@BUILDLEVEL@";
	
	/** 
	 * Unique message type identifiers, with associated
	 * associated integer values.
	 * @private 
	 */
	var MESSAGE_TYPE = {
		CONNECT: 1, 
		CONNACK: 2, 
		PUBLISH: 3,
		PUBACK: 4,
		PUBREC: 5, 
		PUBREL: 6,
		PUBCOMP: 7,
		SUBSCRIBE: 8,
		SUBACK: 9,
		UNSUBSCRIBE: 10,
		UNSUBACK: 11,
		PINGREQ: 12,
		PINGRESP: 13,
		DISCONNECT: 14
	};
	
	// Collection of utility methods used to simplify module code 
	// and promote the DRY pattern.  

	/**
	 * Validate an object's parameter names to ensure they 
	 * match a list of expected variables name for this option
	 * type. Used to ensure option object passed into the API don't
	 * contain erroneous parameters.
	 * @param {Object} obj - User options object
	 * @param {Object} keys - valid keys and types that may exist in obj. 
	 * @throws {Error} Invalid option parameter found. 
	 * @private 
	 */
	var validate = function(obj, keys) {
		for (var key in obj) {
			if (obj.hasOwnProperty(key)) {       		
				if (keys.hasOwnProperty(key)) {
					if (typeof obj[key] !== keys[key])
					   { throw new Error(format(ERROR.INVALID_TYPE, [typeof obj[key], key])); }
				} else {	
					var errorStr = "Unknown property, " + key + ". Valid properties are:";
					for (var key in keys)
						{ if (keys.hasOwnProperty(key))
							{ errorStr = errorStr+" "+key; } }
					throw new Error(errorStr);
				}
			}
		}
	};

	/**
	 * Return a new function which runs the user function bound
	 * to a fixed scope. 
	 * @param {function} User function
	 * @param {object} Function scope  
	 * @return {function} User function bound to another scope
	 * @private 
	 */
	var scope = function (f, scope) {
		return function () {
			return f.apply(scope, arguments);
		};
	};
	
	/** 
	 * Unique message type identifiers, with associated
	 * associated integer values.
	 * @private 
	 */
	var ERROR = {
		OK: {code:0, text:"AMQJSC0000I OK."},
		CONNECT_TIMEOUT: {code:1, text:"AMQJSC0001E Connect timed out."},
		SUBSCRIBE_TIMEOUT: {code:2, text:"AMQJS0002E Subscribe timed out."}, 
		UNSUBSCRIBE_TIMEOUT: {code:3, text:"AMQJS0003E Unsubscribe timed out."},
		PING_TIMEOUT: {code:4, text:"AMQJS0004E Ping timed out."},
		INTERNAL_ERROR: {code:5, text:"AMQJS0005E Internal error. Error Message: {0}, Stack trace: {1}"},
		CONNACK_RETURNCODE: {code:6, text:"AMQJS0006E Bad Connack return code:{0} {1}."},
		SOCKET_ERROR: {code:7, text:"AMQJS0007E Socket error:{0}."},
		SOCKET_CLOSE: {code:8, text:"AMQJS0008I Socket closed."},
		MALFORMED_UTF: {code:9, text:"AMQJS0009E Malformed UTF data:{0} {1} {2}."},
		UNSUPPORTED: {code:10, text:"AMQJS0010E {0} is not supported by this browser."},
		INVALID_STATE: {code:11, text:"AMQJS0011E Invalid state {0}."},
		INVALID_TYPE: {code:12, text:"AMQJS0012E Invalid type {0} for {1}."},
		INVALID_ARGUMENT: {code:13, text:"AMQJS0013E Invalid argument {0} for {1}."},
		UNSUPPORTED_OPERATION: {code:14, text:"AMQJS0014E Unsupported operation."},
		INVALID_STORED_DATA: {code:15, text:"AMQJS0015E Invalid data in local storage key={0} value={1}."},
		INVALID_MQTT_MESSAGE_TYPE: {code:16, text:"AMQJS0016E Invalid MQTT message type {0}."},
		MALFORMED_UNICODE: {code:17, text:"AMQJS0017E Malformed Unicode string:{0} {1}."}
	};
	
	/** CONNACK RC Meaning. */
	var CONNACK_RC = {
		0:"Connection Accepted",
		1:"Connection Refused: unacceptable protocol version",
		2:"Connection Refused: identifier rejected",
		3:"Connection Refused: server unavailable",
		4:"Connection Refused: bad user name or password",
		5:"Connection Refused: not authorized"
	};

	/**
	 * Format an error message text.
	 * @private
	 * @param {error} ERROR.KEY value above.
	 * @param {substitutions} [array] substituted into the text.
	 * @return the text with the substitutions made.
	 */
	var format = function(error, substitutions) {
		var text = error.text;
		if (substitutions) {
		  var field,start;
		  for (var i=0; i<substitutions.length; i++) {
			field = "{"+i+"}";
			start = text.indexOf(field);
			if(start > 0) {
				var part1 = text.substring(0,start);
				var part2 = text.substring(start+field.length);
				text = part1+substitutions[i]+part2;
			}
		  }
		}
		return text;
	};
	
	//MQTT protocol and version          6    M    Q    I    s    d    p    3
	var MqttProtoIdentifierv3 = [0x00,0x06,0x4d,0x51,0x49,0x73,0x64,0x70,0x03];
	//MQTT proto/version for 311         4    M    Q    T    T    4
	var MqttProtoIdentifierv4 = [0x00,0x04,0x4d,0x51,0x54,0x54,0x04];
	
	/**
	 * Construct an MQTT wire protocol message.
	 * @param type MQTT packet type.
	 * @param options optional wire message attributes.
	 * 
	 * Optional properties
	 * 
	 * messageIdentifier: message ID in the range [0..65535]
	 * payloadMessage:	Application Message - PUBLISH only
	 * connectStrings:	array of 0 or more Strings to be put into the CONNECT payload
	 * topics:			array of strings (SUBSCRIBE, UNSUBSCRIBE)
	 * requestQoS:		array of QoS values [0..2]
	 *  
	 * "Flag" properties 
	 * cleanSession:	true if present / false if absent (CONNECT)
	 * willMessage:  	true if present / false if absent (CONNECT)
	 * isRetained:		true if present / false if absent (CONNECT)
	 * userName:		true if present / false if absent (CONNECT)
	 * password:		true if present / false if absent (CONNECT)
	 * keepAliveInterval:	integer [0..65535]  (CONNECT)
	 *
	 * @private
	 * @ignore
	 */
	var WireMessage = function (type, options) {
		var this$1 = this;
 	
		this.type = type;
		for (var name in options) {
			if (options.hasOwnProperty(name)) {
				this$1[name] = options[name];
			}
		}
	};
	
	WireMessage.prototype.encode = function() {
		var this$1 = this;

		// Compute the first byte of the fixed header
		var first = ((this.type & 0x0f) << 4);
		
		/*
		 * Now calculate the length of the variable header + payload by adding up the lengths
		 * of all the component parts
		 */

		var remLength = 0;
		var topicStrLength = new Array();
		var destinationNameLength = 0;
		
		// if the message contains a messageIdentifier then we need two bytes for that
		if (this.messageIdentifier != undefined)
			{ remLength += 2; }

		switch(this.type) {
			// If this a Connect then we need to include 12 bytes for its header
			case MESSAGE_TYPE.CONNECT:
				switch(this.mqttVersion) {
					case 3:
						remLength += MqttProtoIdentifierv3.length + 3;
						break;
					case 4:
						remLength += MqttProtoIdentifierv4.length + 3;
						break;
				}

				remLength += UTF8Length(this.clientId) + 2;
				if (this.willMessage != undefined) {
					remLength += UTF8Length(this.willMessage.destinationName) + 2;
					// Will message is always a string, sent as UTF-8 characters with a preceding length.
					var willMessagePayloadBytes = this.willMessage.payloadBytes;
					if (!(willMessagePayloadBytes instanceof Uint8Array))
						{ willMessagePayloadBytes = new Uint8Array(payloadBytes); }
					remLength += willMessagePayloadBytes.byteLength +2;
				}
				if (this.userName != undefined)
					{ remLength += UTF8Length(this.userName) + 2; }	
				if (this.password != undefined)
					{ remLength += UTF8Length(this.password) + 2; }
			break;

			// Subscribe, Unsubscribe can both contain topic strings
			case MESSAGE_TYPE.SUBSCRIBE:	        	
				first |= 0x02; // Qos = 1;
				for ( var i = 0; i < this.topics.length; i++) {
					topicStrLength[i] = UTF8Length(this$1.topics[i]);
					remLength += topicStrLength[i] + 2;
				}
				remLength += this.requestedQos.length; // 1 byte for each topic's Qos
				// QoS on Subscribe only
				break;

			case MESSAGE_TYPE.UNSUBSCRIBE:
				first |= 0x02; // Qos = 1;
				for ( var i = 0; i < this.topics.length; i++) {
					topicStrLength[i] = UTF8Length(this$1.topics[i]);
					remLength += topicStrLength[i] + 2;
				}
				break;

			case MESSAGE_TYPE.PUBREL:
				first |= 0x02; // Qos = 1;
				break;

			case MESSAGE_TYPE.PUBLISH:
				if (this.payloadMessage.duplicate) { first |= 0x08; }
				first  = first |= (this.payloadMessage.qos << 1);
				if (this.payloadMessage.retained) { first |= 0x01; }
				destinationNameLength = UTF8Length(this.payloadMessage.destinationName);
				remLength += destinationNameLength + 2;	   
				var payloadBytes = this.payloadMessage.payloadBytes;
				remLength += payloadBytes.byteLength;  
				if (payloadBytes instanceof ArrayBuffer)
					{ payloadBytes = new Uint8Array(payloadBytes); }
				else if (!(payloadBytes instanceof Uint8Array))
					{ payloadBytes = new Uint8Array(payloadBytes.buffer); }
				break;

			case MESSAGE_TYPE.DISCONNECT:
				break;

			default:
				;
		}

		// Now we can allocate a buffer for the message

		var mbi = encodeMBI(remLength);  // Convert the length to MQTT MBI format
		var pos = mbi.length + 1;        // Offset of start of variable header
		var buffer = new ArrayBuffer(remLength + pos);
		var byteStream = new Uint8Array(buffer);    // view it as a sequence of bytes

		//Write the fixed header into the buffer
		byteStream[0] = first;
		byteStream.set(mbi,1);

		// If this is a PUBLISH then the variable header starts with a topic
		if (this.type == MESSAGE_TYPE.PUBLISH)
			{ pos = writeString(this.payloadMessage.destinationName, destinationNameLength, byteStream, pos); }
		// If this is a CONNECT then the variable header contains the protocol name/version, flags and keepalive time
		
		else if (this.type == MESSAGE_TYPE.CONNECT) {
			switch (this.mqttVersion) {
				case 3:
					byteStream.set(MqttProtoIdentifierv3, pos);
					pos += MqttProtoIdentifierv3.length;
					break;
				case 4:
					byteStream.set(MqttProtoIdentifierv4, pos);
					pos += MqttProtoIdentifierv4.length;
					break;
			}
			var connectFlags = 0;
			if (this.cleanSession) 
				{ connectFlags = 0x02; }
			if (this.willMessage != undefined ) {
				connectFlags |= 0x04;
				connectFlags |= (this.willMessage.qos<<3);
				if (this.willMessage.retained) {
					connectFlags |= 0x20;
				}
			}
			if (this.userName != undefined)
				{ connectFlags |= 0x80; }
			if (this.password != undefined)
				{ connectFlags |= 0x40; }
			byteStream[pos++] = connectFlags; 
			pos = writeUint16 (this.keepAliveInterval, byteStream, pos);
		}

		// Output the messageIdentifier - if there is one
		if (this.messageIdentifier != undefined)
			{ pos = writeUint16 (this.messageIdentifier, byteStream, pos); }

		switch(this.type) {
			case MESSAGE_TYPE.CONNECT:
				pos = writeString(this.clientId, UTF8Length(this.clientId), byteStream, pos); 
				if (this.willMessage != undefined) {
					pos = writeString(this.willMessage.destinationName, UTF8Length(this.willMessage.destinationName), byteStream, pos);
					pos = writeUint16(willMessagePayloadBytes.byteLength, byteStream, pos);
					byteStream.set(willMessagePayloadBytes, pos);
					pos += willMessagePayloadBytes.byteLength;
					
				}
			if (this.userName != undefined)
				{ pos = writeString(this.userName, UTF8Length(this.userName), byteStream, pos); }
			if (this.password != undefined) 
				{ pos = writeString(this.password, UTF8Length(this.password), byteStream, pos); }
			break;

			case MESSAGE_TYPE.PUBLISH:	
				// PUBLISH has a text or binary payload, if text do not add a 2 byte length field, just the UTF characters.	
				byteStream.set(payloadBytes, pos);
					
				break;

//    	    case MESSAGE_TYPE.PUBREC:	
//    	    case MESSAGE_TYPE.PUBREL:	
//    	    case MESSAGE_TYPE.PUBCOMP:	
//    	    	break;

			case MESSAGE_TYPE.SUBSCRIBE:
				// SUBSCRIBE has a list of topic strings and request QoS
				for (var i=0; i<this.topics.length; i++) {
					pos = writeString(this$1.topics[i], topicStrLength[i], byteStream, pos);
					byteStream[pos++] = this$1.requestedQos[i];
				}
				break;

			case MESSAGE_TYPE.UNSUBSCRIBE:	
				// UNSUBSCRIBE has a list of topic strings
				for (var i=0; i<this.topics.length; i++)
					{ pos = writeString(this$1.topics[i], topicStrLength[i], byteStream, pos); }
				break;

			default:
				// Do nothing.
		}

		return buffer;
	};	

	function decodeMessage(input,pos) {
	    var startingPos = pos;
		var first = input[pos];
		var type = first >> 4;
		var messageInfo = first &= 0x0f;
		pos += 1;
		

		// Decode the remaining length (MBI format)

		var digit;
		var remLength = 0;
		var multiplier = 1;
		do {
			if (pos == input.length) {
			    return [null,startingPos];
			}
			digit = input[pos++];
			remLength += ((digit & 0x7F) * multiplier);
			multiplier *= 128;
		} while ((digit & 0x80) != 0);
		
		var endPos = pos+remLength;
		if (endPos > input.length) {
		    return [null,startingPos];
		}

		var wireMessage = new WireMessage(type);
		switch(type) {
			case MESSAGE_TYPE.CONNACK:
				var connectAcknowledgeFlags = input[pos++];
				if (connectAcknowledgeFlags & 0x01)
					{ wireMessage.sessionPresent = true; }
				wireMessage.returnCode = input[pos++];
				break;
			
			case MESSAGE_TYPE.PUBLISH:     	    	
				var qos = (messageInfo >> 1) & 0x03;
							
				var len = readUint16(input, pos);
				pos += 2;
				var topicName = parseUTF8(input, pos, len);
				pos += len;
				// If QoS 1 or 2 there will be a messageIdentifier
				if (qos > 0) {
					wireMessage.messageIdentifier = readUint16(input, pos);
					pos += 2;
				}
				
				var message = new Paho.MQTT.Message(input.subarray(pos, endPos));
				if ((messageInfo & 0x01) == 0x01) 
					{ message.retained = true; }
				if ((messageInfo & 0x08) == 0x08)
					{ message.duplicate =  true; }
				message.qos = qos;
				message.destinationName = topicName;
				wireMessage.payloadMessage = message;	
				break;
			
			case  MESSAGE_TYPE.PUBACK:
			case  MESSAGE_TYPE.PUBREC:	    
			case  MESSAGE_TYPE.PUBREL:    
			case  MESSAGE_TYPE.PUBCOMP:
			case  MESSAGE_TYPE.UNSUBACK:    	    	
				wireMessage.messageIdentifier = readUint16(input, pos);
				break;
				
			case  MESSAGE_TYPE.SUBACK:
				wireMessage.messageIdentifier = readUint16(input, pos);
				pos += 2;
				wireMessage.returnCode = input.subarray(pos, endPos);	
				break;
		
			default:
				;
		}
				
		return [wireMessage,endPos];	
	}

	function writeUint16(input, buffer, offset) {
		buffer[offset++] = input >> 8;      //MSB
		buffer[offset++] = input % 256;     //LSB 
		return offset;
	}	

	function writeString(input, utf8Length, buffer, offset) {
		offset = writeUint16(utf8Length, buffer, offset);
		stringToUTF8(input, buffer, offset);
		return offset + utf8Length;
	}	

	function readUint16(buffer, offset) {
		return 256*buffer[offset] + buffer[offset+1];
	}	

	/**
	 * Encodes an MQTT Multi-Byte Integer
	 * @private 
	 */
	function encodeMBI(number) {
		var output = new Array(1);
		var numBytes = 0;

		do {
			var digit = number % 128;
			number = number >> 7;
			if (number > 0) {
				digit |= 0x80;
			}
			output[numBytes++] = digit;
		} while ( (number > 0) && (numBytes<4) );

		return output;
	}

	/**
	 * Takes a String and calculates its length in bytes when encoded in UTF8.
	 * @private
	 */
	function UTF8Length(input) {
		var output = 0;
		for (var i = 0; i<input.length; i++) 
		{
			var charCode = input.charCodeAt(i);
				if (charCode > 0x7FF)
				   {
					  // Surrogate pair means its a 4 byte character
					  if (0xD800 <= charCode && charCode <= 0xDBFF)
						{
						  i++;
						  output++;
						}
				   output +=3;
				   }
			else if (charCode > 0x7F)
				{ output +=2; }
			else
				{ output++; }
		} 
		return output;
	}
	
	/**
	 * Takes a String and writes it into an array as UTF8 encoded bytes.
	 * @private
	 */
	function stringToUTF8(input, output, start) {
		var pos = start;
		for (var i = 0; i<input.length; i++) {
			var charCode = input.charCodeAt(i);
			
			// Check for a surrogate pair.
			if (0xD800 <= charCode && charCode <= 0xDBFF) {
				var lowCharCode = input.charCodeAt(++i);
				if (isNaN(lowCharCode)) {
					throw new Error(format(ERROR.MALFORMED_UNICODE, [charCode, lowCharCode]));
				}
				charCode = ((charCode - 0xD800)<<10) + (lowCharCode - 0xDC00) + 0x10000;
			
			}
			
			if (charCode <= 0x7F) {
				output[pos++] = charCode;
			} else if (charCode <= 0x7FF) {
				output[pos++] = charCode>>6  & 0x1F | 0xC0;
				output[pos++] = charCode     & 0x3F | 0x80;
			} else if (charCode <= 0xFFFF) {    				    
				output[pos++] = charCode>>12 & 0x0F | 0xE0;
				output[pos++] = charCode>>6  & 0x3F | 0x80;   
				output[pos++] = charCode     & 0x3F | 0x80;   
			} else {
				output[pos++] = charCode>>18 & 0x07 | 0xF0;
				output[pos++] = charCode>>12 & 0x3F | 0x80;
				output[pos++] = charCode>>6  & 0x3F | 0x80;
				output[pos++] = charCode     & 0x3F | 0x80;
			}
		} 
		return output;
	}
	
	function parseUTF8(input, offset, length) {
		var output = "";
		var utf16;
		var pos = offset;

		while (pos < offset+length)
		{
			var byte1 = input[pos++];
			if (byte1 < 128)
				{ utf16 = byte1; }
			else 
			{
				var byte2 = input[pos++]-128;
				if (byte2 < 0) 
					{ throw new Error(format(ERROR.MALFORMED_UTF, [byte1.toString(16), byte2.toString(16),""])); }
				if (byte1 < 0xE0)             // 2 byte character
					{ utf16 = 64*(byte1-0xC0) + byte2; }
				else 
				{ 
					var byte3 = input[pos++]-128;
					if (byte3 < 0) 
						{ throw new Error(format(ERROR.MALFORMED_UTF, [byte1.toString(16), byte2.toString(16), byte3.toString(16)])); }
					if (byte1 < 0xF0)        // 3 byte character
						{ utf16 = 4096*(byte1-0xE0) + 64*byte2 + byte3; }
								else
								{
								   var byte4 = input[pos++]-128;
								   if (byte4 < 0) 
						{ throw new Error(format(ERROR.MALFORMED_UTF, [byte1.toString(16), byte2.toString(16), byte3.toString(16), byte4.toString(16)])); }
								   if (byte1 < 0xF8)        // 4 byte character 
										   { utf16 = 262144*(byte1-0xF0) + 4096*byte2 + 64*byte3 + byte4; }
					   else                     // longer encodings are not supported  
						{ throw new Error(format(ERROR.MALFORMED_UTF, [byte1.toString(16), byte2.toString(16), byte3.toString(16), byte4.toString(16)])); }
								}
				}
			}  

				if (utf16 > 0xFFFF)   // 4 byte character - express as a surrogate pair
				  {
					 utf16 -= 0x10000;
					 output += String.fromCharCode(0xD800 + (utf16 >> 10)); // lead character
					 utf16 = 0xDC00 + (utf16 & 0x3FF);  // trail character
				  }
			output += String.fromCharCode(utf16);
		}
		return output;
	}
	
	/** 
	 * Repeat keepalive requests, monitor responses.
	 * @ignore
	 */
	var Pinger = function(client, window, keepAliveInterval) { 
		this._client = client;        	
		this._window = window;
		this._keepAliveInterval = keepAliveInterval*1000;     	
		this.isReset = false;
		
		var pingReq = new WireMessage(MESSAGE_TYPE.PINGREQ).encode(); 
		
		var doTimeout = function (pinger) {
			return function () {
				return doPing.apply(pinger);
			};
		};
		
		/** @ignore */
		var doPing = function() { 
			if (!this.isReset) {
				this._client._trace("Pinger.doPing", "Timed out");
				this._client._disconnected( ERROR.PING_TIMEOUT.code , format(ERROR.PING_TIMEOUT));
			} else {
				this.isReset = false;
				this._client._trace("Pinger.doPing", "send PINGREQ");
				this._client.socket.send(pingReq); 
				this.timeout = this._window.setTimeout(doTimeout(this), this._keepAliveInterval);
			}
		};

		this.reset = function() {
			this.isReset = true;
			this._window.clearTimeout(this.timeout);
			if (this._keepAliveInterval > 0)
				{ this.timeout = setTimeout(doTimeout(this), this._keepAliveInterval); }
		};

		this.cancel = function() {
			this._window.clearTimeout(this.timeout);
		};
	 }; 

	/**
	 * Monitor request completion.
	 * @ignore
	 */
	var Timeout = function(client, window, timeoutSeconds, action, args) {
		this._window = window;
		if (!timeoutSeconds)
			{ timeoutSeconds = 30; }
		
		var doTimeout = function (action, client, args) {
			return function () {
				return action.apply(client, args);
			};
		};
		this.timeout = setTimeout(doTimeout(action, client, args), timeoutSeconds * 1000);
		
		this.cancel = function() {
			this._window.clearTimeout(this.timeout);
		};
	}; 
	
	/*
	 * Internal implementation of the Websockets MQTT V3.1 client.
	 * 
	 * @name Paho.MQTT.ClientImpl @constructor 
	 * @param {String} host the DNS nameof the webSocket host. 
	 * @param {Number} port the port number for that host.
	 * @param {String} clientId the MQ client identifier.
	 */
	var ClientImpl = function (uri, host, port, path, clientId) {
		var this$1 = this;

		// Check dependencies are satisfied in this browser.
		if (!("WebSocket" in global && global["WebSocket"] !== null)) {
			throw new Error(format(ERROR.UNSUPPORTED, ["WebSocket"]));
		}
		if (!("localStorage" in global && global["localStorage"] !== null)) {
			throw new Error(format(ERROR.UNSUPPORTED, ["localStorage"]));
		}
		if (!("ArrayBuffer" in global && global["ArrayBuffer"] !== null)) {
			throw new Error(format(ERROR.UNSUPPORTED, ["ArrayBuffer"]));
		}
		this._trace("Paho.MQTT.Client", uri, host, port, path, clientId);

		this.host = host;
		this.port = port;
		this.path = path;
		this.uri = uri;
		this.clientId = clientId;

		// Local storagekeys are qualified with the following string.
		// The conditional inclusion of path in the key is for backward
		// compatibility to when the path was not configurable and assumed to
		// be /mqtt
		this._localKey=host+":"+port+(path!="/mqtt"?":"+path:"")+":"+clientId+":";

		// Create private instance-only message queue
		// Internal queue of messages to be sent, in sending order. 
		this._msg_queue = [];

		// Messages we have sent and are expecting a response for, indexed by their respective message ids. 
		this._sentMessages = {};

		// Messages we have received and acknowleged and are expecting a confirm message for
		// indexed by their respective message ids. 
		this._receivedMessages = {};

		// Internal list of callbacks to be executed when messages
		// have been successfully sent over web socket, e.g. disconnect
		// when it doesn't have to wait for ACK, just message is dispatched.
		this._notify_msg_sent = {};

		// Unique identifier for SEND messages, incrementing
		// counter as messages are sent.
		this._message_identifier = 1;
		
		// Used to determine the transmission sequence of stored sent messages.
		this._sequence = 0;
		

		// Load the local state, if any, from the saved version, only restore state relevant to this client.   	
		for (var key in localStorage)
			{ if (   key.indexOf("Sent:"+this$1._localKey) == 0  		    
				|| key.indexOf("Received:"+this$1._localKey) == 0)
			{ this$1.restore(key); } }
	};

	// Messaging Client public instance members. 
	ClientImpl.prototype.host;
	ClientImpl.prototype.port;
	ClientImpl.prototype.path;
	ClientImpl.prototype.uri;
	ClientImpl.prototype.clientId;

	// Messaging Client private instance members.
	ClientImpl.prototype.socket;
	/* true once we have received an acknowledgement to a CONNECT packet. */
	ClientImpl.prototype.connected = false;
	/* The largest message identifier allowed, may not be larger than 2**16 but 
	 * if set smaller reduces the maximum number of outbound messages allowed.
	 */ 
	ClientImpl.prototype.maxMessageIdentifier = 65536;
	ClientImpl.prototype.connectOptions;
	ClientImpl.prototype.hostIndex;
	ClientImpl.prototype.onConnectionLost;
	ClientImpl.prototype.onMessageDelivered;
	ClientImpl.prototype.onMessageArrived;
	ClientImpl.prototype.traceFunction;
	ClientImpl.prototype._msg_queue = null;
	ClientImpl.prototype._connectTimeout;
	/* The sendPinger monitors how long we allow before we send data to prove to the server that we are alive. */
	ClientImpl.prototype.sendPinger = null;
	/* The receivePinger monitors how long we allow before we require evidence that the server is alive. */
	ClientImpl.prototype.receivePinger = null;
	
	ClientImpl.prototype.receiveBuffer = null;
	
	ClientImpl.prototype._traceBuffer = null;
	ClientImpl.prototype._MAX_TRACE_ENTRIES = 100;

	ClientImpl.prototype.connect = function (connectOptions) {
		var connectOptionsMasked = this._traceMask(connectOptions, "password"); 
		this._trace("Client.connect", connectOptionsMasked, this.socket, this.connected);
		
		if (this.connected) 
			{ throw new Error(format(ERROR.INVALID_STATE, ["already connected"])); }
		if (this.socket)
			{ throw new Error(format(ERROR.INVALID_STATE, ["already connected"])); }
		
		this.connectOptions = connectOptions;
		
		if (connectOptions.uris) {
			this.hostIndex = 0;
			this._doConnect(connectOptions.uris[0]);  
		} else {
			this._doConnect(this.uri);  		
		}
		
	};

	ClientImpl.prototype.subscribe = function (filter, subscribeOptions) {
		this._trace("Client.subscribe", filter, subscribeOptions);
			  
		if (!this.connected)
			{ throw new Error(format(ERROR.INVALID_STATE, ["not connected"])); }
		
		var wireMessage = new WireMessage(MESSAGE_TYPE.SUBSCRIBE);
		wireMessage.topics=[filter];
		if (subscribeOptions.qos != undefined)
			{ wireMessage.requestedQos = [subscribeOptions.qos]; }
		else 
			{ wireMessage.requestedQos = [0]; }
		
		if (subscribeOptions.onSuccess) {
			wireMessage.onSuccess = function(grantedQos) {subscribeOptions.onSuccess({invocationContext:subscribeOptions.invocationContext,grantedQos:grantedQos});};
		}

		if (subscribeOptions.onFailure) {
			wireMessage.onFailure = function(errorCode) {subscribeOptions.onFailure({invocationContext:subscribeOptions.invocationContext,errorCode:errorCode});};
		}

		if (subscribeOptions.timeout) {
			wireMessage.timeOut = new Timeout(this, window, subscribeOptions.timeout, subscribeOptions.onFailure
					, [{invocationContext:subscribeOptions.invocationContext, 
						errorCode:ERROR.SUBSCRIBE_TIMEOUT.code, 
						errorMessage:format(ERROR.SUBSCRIBE_TIMEOUT)}]);
		}
		
		// All subscriptions return a SUBACK. 
		this._requires_ack(wireMessage);
		this._schedule_message(wireMessage);
	};

	/** @ignore */
	ClientImpl.prototype.unsubscribe = function(filter, unsubscribeOptions) {  
		this._trace("Client.unsubscribe", filter, unsubscribeOptions);
		
		if (!this.connected)
		   { throw new Error(format(ERROR.INVALID_STATE, ["not connected"])); }
		
		var wireMessage = new WireMessage(MESSAGE_TYPE.UNSUBSCRIBE);
		wireMessage.topics = [filter];
		
		if (unsubscribeOptions.onSuccess) {
			wireMessage.callback = function() {unsubscribeOptions.onSuccess({invocationContext:unsubscribeOptions.invocationContext});};
		}
		if (unsubscribeOptions.timeout) {
			wireMessage.timeOut = new Timeout(this, window, unsubscribeOptions.timeout, unsubscribeOptions.onFailure
					, [{invocationContext:unsubscribeOptions.invocationContext,
						errorCode:ERROR.UNSUBSCRIBE_TIMEOUT.code,
						errorMessage:format(ERROR.UNSUBSCRIBE_TIMEOUT)}]);
		}
	 
		// All unsubscribes return a SUBACK.         
		this._requires_ack(wireMessage);
		this._schedule_message(wireMessage);
	};
	 
	ClientImpl.prototype.send = function (message) {
		this._trace("Client.send", message);

		if (!this.connected)
		   { throw new Error(format(ERROR.INVALID_STATE, ["not connected"])); }
		
		wireMessage = new WireMessage(MESSAGE_TYPE.PUBLISH);
		wireMessage.payloadMessage = message;
		
		if (message.qos > 0)
			{ this._requires_ack(wireMessage); }
		else if (this.onMessageDelivered)
			{ this._notify_msg_sent[wireMessage] = this.onMessageDelivered(wireMessage.payloadMessage); }
		this._schedule_message(wireMessage);
	};
	
	ClientImpl.prototype.disconnect = function () {
		this._trace("Client.disconnect");

		if (!this.socket)
			{ throw new Error(format(ERROR.INVALID_STATE, ["not connecting or connected"])); }
		
		wireMessage = new WireMessage(MESSAGE_TYPE.DISCONNECT);

		// Run the disconnected call back as soon as the message has been sent,
		// in case of a failure later on in the disconnect processing.
		// as a consequence, the _disconected call back may be run several times.
		this._notify_msg_sent[wireMessage] = scope(this._disconnected, this);

		this._schedule_message(wireMessage);
	};
	
	ClientImpl.prototype.getTraceLog = function () {
		var this$1 = this;

		if ( this._traceBuffer !== null ) {
			this._trace("Client.getTraceLog", new Date());
			this._trace("Client.getTraceLog in flight messages", this._sentMessages.length);
			for (var key in this$1._sentMessages)
				{ this$1._trace("_sentMessages ",key, this$1._sentMessages[key]); }
			for (var key in this$1._receivedMessages)
				{ this$1._trace("_receivedMessages ",key, this$1._receivedMessages[key]); }
			
			return this._traceBuffer;
		}
	};
	
	ClientImpl.prototype.startTrace = function () {
		if ( this._traceBuffer === null ) {
			this._traceBuffer = [];
		}
		this._trace("Client.startTrace", new Date(), version);
	};
	
	ClientImpl.prototype.stopTrace = function () {
		delete this._traceBuffer;
	};

	ClientImpl.prototype._doConnect = function (wsurl) { 	        
		// When the socket is open, this client will send the CONNECT WireMessage using the saved parameters. 
		if (this.connectOptions.useSSL) {
		    var uriParts = wsurl.split(":");
		    uriParts[0] = "wss";
		    wsurl = uriParts.join(":");
		}
		this.connected = false;
		if (this.connectOptions.mqttVersion < 4) {
			this.socket = new WebSocket(wsurl, ["mqttv3.1"]);
		} else {
			this.socket = new WebSocket(wsurl, ["mqtt"]);
		}
		this.socket.binaryType = 'arraybuffer';
		
		this.socket.onopen = scope(this._on_socket_open, this);
		this.socket.onmessage = scope(this._on_socket_message, this);
		this.socket.onerror = scope(this._on_socket_error, this);
		this.socket.onclose = scope(this._on_socket_close, this);
		
		this.sendPinger = new Pinger(this, window, this.connectOptions.keepAliveInterval);
		this.receivePinger = new Pinger(this, window, this.connectOptions.keepAliveInterval);
		
		this._connectTimeout = new Timeout(this, window, this.connectOptions.timeout, this._disconnected,  [ERROR.CONNECT_TIMEOUT.code, format(ERROR.CONNECT_TIMEOUT)]);
	};

	
	// Schedule a new message to be sent over the WebSockets
	// connection. CONNECT messages cause WebSocket connection
	// to be started. All other messages are queued internally
	// until this has happened. When WS connection starts, process
	// all outstanding messages. 
	ClientImpl.prototype._schedule_message = function (message) {
		this._msg_queue.push(message);
		// Process outstanding messages in the queue if we have an  open socket, and have received CONNACK. 
		if (this.connected) {
			this._process_queue();
		}
	};

	ClientImpl.prototype.store = function(prefix, wireMessage) {
		var storedMessage = {type:wireMessage.type, messageIdentifier:wireMessage.messageIdentifier, version:1};
		
		switch(wireMessage.type) {
		  case MESSAGE_TYPE.PUBLISH:
			  if(wireMessage.pubRecReceived)
				  { storedMessage.pubRecReceived = true; }
			  
			  // Convert the payload to a hex string.
			  storedMessage.payloadMessage = {};
			  var hex = "";
			  var messageBytes = wireMessage.payloadMessage.payloadBytes;
			  for (var i=0; i<messageBytes.length; i++) {
				if (messageBytes[i] <= 0xF)
				  { hex = hex+"0"+messageBytes[i].toString(16); }
				else 
				  { hex = hex+messageBytes[i].toString(16); }
			  }
			  storedMessage.payloadMessage.payloadHex = hex;
			  
			  storedMessage.payloadMessage.qos = wireMessage.payloadMessage.qos;
			  storedMessage.payloadMessage.destinationName = wireMessage.payloadMessage.destinationName;
			  if (wireMessage.payloadMessage.duplicate) 
				  { storedMessage.payloadMessage.duplicate = true; }
			  if (wireMessage.payloadMessage.retained) 
				  { storedMessage.payloadMessage.retained = true; }	   
			  
			  // Add a sequence number to sent messages.
			  if ( prefix.indexOf("Sent:") == 0 ) {
				  if ( wireMessage.sequence === undefined )
					  { wireMessage.sequence = ++this._sequence; }
				  storedMessage.sequence = wireMessage.sequence;
			  }
			  break;    
			  
			default:
				throw Error(format(ERROR.INVALID_STORED_DATA, [key, storedMessage]));
		}
		localStorage.setItem(prefix+this._localKey+wireMessage.messageIdentifier, JSON.stringify(storedMessage));
	};
	
	ClientImpl.prototype.restore = function(key) {    	
		var value = localStorage.getItem(key);
		var storedMessage = JSON.parse(value);
		
		var wireMessage = new WireMessage(storedMessage.type, storedMessage);
		
		switch(storedMessage.type) {
		  case MESSAGE_TYPE.PUBLISH:
			  // Replace the payload message with a Message object.
			  var hex = storedMessage.payloadMessage.payloadHex;
			  var buffer = new ArrayBuffer((hex.length)/2);
			  var byteStream = new Uint8Array(buffer); 
			  var i = 0;
			  while (hex.length >= 2) { 
				  var x = parseInt(hex.substring(0, 2), 16);
				  hex = hex.substring(2, hex.length);
				  byteStream[i++] = x;
			  }
			  var payloadMessage = new Paho.MQTT.Message(byteStream);
			  
			  payloadMessage.qos = storedMessage.payloadMessage.qos;
			  payloadMessage.destinationName = storedMessage.payloadMessage.destinationName;
			  if (storedMessage.payloadMessage.duplicate) 
				  { payloadMessage.duplicate = true; }
			  if (storedMessage.payloadMessage.retained) 
				  { payloadMessage.retained = true; }	 
			  wireMessage.payloadMessage = payloadMessage;
			  
			  break;    
			  
			default:
			  throw Error(format(ERROR.INVALID_STORED_DATA, [key, value]));
		}
							
		if (key.indexOf("Sent:"+this._localKey) == 0) {
			wireMessage.payloadMessage.duplicate = true;
			this._sentMessages[wireMessage.messageIdentifier] = wireMessage;    		    
		} else if (key.indexOf("Received:"+this._localKey) == 0) {
			this._receivedMessages[wireMessage.messageIdentifier] = wireMessage;
		}
	};
	
	ClientImpl.prototype._process_queue = function () {
		var this$1 = this;

		var message = null;
		// Process messages in order they were added
		var fifo = this._msg_queue.reverse();

		// Send all queued messages down socket connection
		while ((message = fifo.pop())) {
			this$1._socket_send(message);
			// Notify listeners that message was successfully sent
			if (this$1._notify_msg_sent[message]) {
				this$1._notify_msg_sent[message]();
				delete this$1._notify_msg_sent[message];
			}
		}
	};

	/**
	 * Expect an ACK response for this message. Add message to the set of in progress
	 * messages and set an unused identifier in this message.
	 * @ignore
	 */
	ClientImpl.prototype._requires_ack = function (wireMessage) {
		var this$1 = this;

		var messageCount = Object.keys(this._sentMessages).length;
		if (messageCount > this.maxMessageIdentifier)
			{ throw Error ("Too many messages:"+messageCount); }

		while(this._sentMessages[this._message_identifier] !== undefined) {
			this$1._message_identifier++;
		}
		wireMessage.messageIdentifier = this._message_identifier;
		this._sentMessages[wireMessage.messageIdentifier] = wireMessage;
		if (wireMessage.type === MESSAGE_TYPE.PUBLISH) {
			this.store("Sent:", wireMessage);
		}
		if (this._message_identifier === this.maxMessageIdentifier) {
			this._message_identifier = 1;
		}
	};

	/** 
	 * Called when the underlying websocket has been opened.
	 * @ignore
	 */
	ClientImpl.prototype._on_socket_open = function () {      
		// Create the CONNECT message object.
		var wireMessage = new WireMessage(MESSAGE_TYPE.CONNECT, this.connectOptions); 
		wireMessage.clientId = this.clientId;
		this._socket_send(wireMessage);
	};

	/** 
	 * Called when the underlying websocket has received a complete packet.
	 * @ignore
	 */
	ClientImpl.prototype._on_socket_message = function (event) {
		var this$1 = this;

		this._trace("Client._on_socket_message", event.data);
		var messages = this._deframeMessages(event.data);
		for (var i = 0; i < messages.length; i+=1) {
		    this$1._handleMessage(messages[i]);
		}
	};
	
	ClientImpl.prototype._deframeMessages = function(data) {
		var byteArray = new Uint8Array(data);
	    if (this.receiveBuffer) {
	        var newData = new Uint8Array(this.receiveBuffer.length+byteArray.length);
	        newData.set(this.receiveBuffer);
	        newData.set(byteArray,this.receiveBuffer.length);
	        byteArray = newData;
	        delete this.receiveBuffer;
	    }
		try {
		    var offset = 0;
		    var messages = [];
		    while(offset < byteArray.length) {
		        var result = decodeMessage(byteArray,offset);
		        var wireMessage = result[0];
		        offset = result[1];
		        if (wireMessage !== null) {
		            messages.push(wireMessage);
		        } else {
		            break;
		        }
		    }
		    if (offset < byteArray.length) {
		    	this.receiveBuffer = byteArray.subarray(offset);
		    }
		} catch (error) {
			this._disconnected(ERROR.INTERNAL_ERROR.code , format(ERROR.INTERNAL_ERROR, [error.message,error.stack.toString()]));
			return;
		}
		return messages;
	};
	
	ClientImpl.prototype._handleMessage = function(wireMessage) {
		var this$1 = this;

		
		this._trace("Client._handleMessage", wireMessage);

		try {
			switch(wireMessage.type) {
			case MESSAGE_TYPE.CONNACK:
				this._connectTimeout.cancel();
				
				// If we have started using clean session then clear up the local state.
				if (this.connectOptions.cleanSession) {
					for (var key in this$1._sentMessages) {	    		
						var sentMessage = this$1._sentMessages[key];
						localStorage.removeItem("Sent:"+this$1._localKey+sentMessage.messageIdentifier);
					}
					this._sentMessages = {};

					for (var key in this$1._receivedMessages) {
						var receivedMessage = this$1._receivedMessages[key];
						localStorage.removeItem("Received:"+this$1._localKey+receivedMessage.messageIdentifier);
					}
					this._receivedMessages = {};
				}
				// Client connected and ready for business.
				if (wireMessage.returnCode === 0) {
					this.connected = true;
					// Jump to the end of the list of uris and stop looking for a good host.
					if (this.connectOptions.uris)
						{ this.hostIndex = this.connectOptions.uris.length; }
				} else {
					this._disconnected(ERROR.CONNACK_RETURNCODE.code , format(ERROR.CONNACK_RETURNCODE, [wireMessage.returnCode, CONNACK_RC[wireMessage.returnCode]]));
					break;
				}
				
				// Resend messages.
				var sequencedMessages = new Array();
				for (var msgId in this$1._sentMessages) {
					if (this$1._sentMessages.hasOwnProperty(msgId))
						{ sequencedMessages.push(this$1._sentMessages[msgId]); }
				}
		  
				// Sort sentMessages into the original sent order.
				var sequencedMessages = sequencedMessages.sort(function(a,b) {return a.sequence - b.sequence;} );
				for (var i=0, len=sequencedMessages.length; i<len; i++) {
					var sentMessage = sequencedMessages[i];
					if (sentMessage.type == MESSAGE_TYPE.PUBLISH && sentMessage.pubRecReceived) {
						var pubRelMessage = new WireMessage(MESSAGE_TYPE.PUBREL, {messageIdentifier:sentMessage.messageIdentifier});
						this$1._schedule_message(pubRelMessage);
					} else {
						this$1._schedule_message(sentMessage);
					}
				}

				// Execute the connectOptions.onSuccess callback if there is one.
				if (this.connectOptions.onSuccess) {
					this.connectOptions.onSuccess({invocationContext:this.connectOptions.invocationContext});
				}

				// Process all queued messages now that the connection is established. 
				this._process_queue();
				break;
		
			case MESSAGE_TYPE.PUBLISH:
				this._receivePublish(wireMessage);
				break;

			case MESSAGE_TYPE.PUBACK:
				var sentMessage = this._sentMessages[wireMessage.messageIdentifier];
				 // If this is a re flow of a PUBACK after we have restarted receivedMessage will not exist.
				if (sentMessage) {
					delete this._sentMessages[wireMessage.messageIdentifier];
					localStorage.removeItem("Sent:"+this._localKey+wireMessage.messageIdentifier);
					if (this.onMessageDelivered)
						{ this.onMessageDelivered(sentMessage.payloadMessage); }
				}
				break;
			
			case MESSAGE_TYPE.PUBREC:
				var sentMessage = this._sentMessages[wireMessage.messageIdentifier];
				// If this is a re flow of a PUBREC after we have restarted receivedMessage will not exist.
				if (sentMessage) {
					sentMessage.pubRecReceived = true;
					var pubRelMessage = new WireMessage(MESSAGE_TYPE.PUBREL, {messageIdentifier:wireMessage.messageIdentifier});
					this.store("Sent:", sentMessage);
					this._schedule_message(pubRelMessage);
				}
				break;
								
			case MESSAGE_TYPE.PUBREL:
				var receivedMessage = this._receivedMessages[wireMessage.messageIdentifier];
				localStorage.removeItem("Received:"+this._localKey+wireMessage.messageIdentifier);
				// If this is a re flow of a PUBREL after we have restarted receivedMessage will not exist.
				if (receivedMessage) {
					this._receiveMessage(receivedMessage);
					delete this._receivedMessages[wireMessage.messageIdentifier];
				}
				// Always flow PubComp, we may have previously flowed PubComp but the server lost it and restarted.
				var pubCompMessage = new WireMessage(MESSAGE_TYPE.PUBCOMP, {messageIdentifier:wireMessage.messageIdentifier});
				this._schedule_message(pubCompMessage);                    
				break;

			case MESSAGE_TYPE.PUBCOMP: 
				var sentMessage = this._sentMessages[wireMessage.messageIdentifier];
				delete this._sentMessages[wireMessage.messageIdentifier];
				localStorage.removeItem("Sent:"+this._localKey+wireMessage.messageIdentifier);
				if (this.onMessageDelivered)
					{ this.onMessageDelivered(sentMessage.payloadMessage); }
				break;
				
			case MESSAGE_TYPE.SUBACK:
				var sentMessage = this._sentMessages[wireMessage.messageIdentifier];
				if (sentMessage) {
					if(sentMessage.timeOut)
						{ sentMessage.timeOut.cancel(); }
					// This will need to be fixed when we add multiple topic support
          			if (wireMessage.returnCode[0] === 0x80) {
						if (sentMessage.onFailure) {
							sentMessage.onFailure(wireMessage.returnCode);
						} 
					} else if (sentMessage.onSuccess) {
						sentMessage.onSuccess(wireMessage.returnCode);
					}
					delete this._sentMessages[wireMessage.messageIdentifier];
				}
				break;
				
			case MESSAGE_TYPE.UNSUBACK:
				var sentMessage = this._sentMessages[wireMessage.messageIdentifier];
				if (sentMessage) { 
					if (sentMessage.timeOut)
						{ sentMessage.timeOut.cancel(); }
					if (sentMessage.callback) {
						sentMessage.callback();
					}
					delete this._sentMessages[wireMessage.messageIdentifier];
				}

				break;
				
			case MESSAGE_TYPE.PINGRESP:
				/* The sendPinger or receivePinger may have sent a ping, the receivePinger has already been reset. */
				this.sendPinger.reset();
				break;
				
			case MESSAGE_TYPE.DISCONNECT:
				// Clients do not expect to receive disconnect packets.
				this._disconnected(ERROR.INVALID_MQTT_MESSAGE_TYPE.code , format(ERROR.INVALID_MQTT_MESSAGE_TYPE, [wireMessage.type]));
				break;

			default:
				this._disconnected(ERROR.INVALID_MQTT_MESSAGE_TYPE.code , format(ERROR.INVALID_MQTT_MESSAGE_TYPE, [wireMessage.type]));
			}
		} catch (error) {
			this._disconnected(ERROR.INTERNAL_ERROR.code , format(ERROR.INTERNAL_ERROR, [error.message,error.stack.toString()]));
			return;
		}
	};
	
	/** @ignore */
	ClientImpl.prototype._on_socket_error = function (error) {
		this._disconnected(ERROR.SOCKET_ERROR.code , format(ERROR.SOCKET_ERROR, [error.data]));
	};

	/** @ignore */
	ClientImpl.prototype._on_socket_close = function () {
		this._disconnected(ERROR.SOCKET_CLOSE.code , format(ERROR.SOCKET_CLOSE));
	};

	/** @ignore */
	ClientImpl.prototype._socket_send = function (wireMessage) {
		
		if (wireMessage.type == 1) {
			var wireMessageMasked = this._traceMask(wireMessage, "password"); 
			this._trace("Client._socket_send", wireMessageMasked);
		}
		else { this._trace("Client._socket_send", wireMessage); }
		
		this.socket.send(wireMessage.encode());
		/* We have proved to the server we are alive. */
		this.sendPinger.reset();
	};
	
	/** @ignore */
	ClientImpl.prototype._receivePublish = function (wireMessage) {
		switch(wireMessage.payloadMessage.qos) {
			case "undefined":
			case 0:
				this._receiveMessage(wireMessage);
				break;

			case 1:
				var pubAckMessage = new WireMessage(MESSAGE_TYPE.PUBACK, {messageIdentifier:wireMessage.messageIdentifier});
				this._schedule_message(pubAckMessage);
				this._receiveMessage(wireMessage);
				break;

			case 2:
				this._receivedMessages[wireMessage.messageIdentifier] = wireMessage;
				this.store("Received:", wireMessage);
				var pubRecMessage = new WireMessage(MESSAGE_TYPE.PUBREC, {messageIdentifier:wireMessage.messageIdentifier});
				this._schedule_message(pubRecMessage);

				break;

			default:
				throw Error("Invaild qos="+wireMmessage.payloadMessage.qos);
		}
	};

	/** @ignore */
	ClientImpl.prototype._receiveMessage = function (wireMessage) {
		if (this.onMessageArrived) {
			this.onMessageArrived(wireMessage.payloadMessage);
		}
	};

	/**
	 * Client has disconnected either at its own request or because the server
	 * or network disconnected it. Remove all non-durable state.
	 * @param {errorCode} [number] the error number.
	 * @param {errorText} [string] the error text.
	 * @ignore
	 */
	ClientImpl.prototype._disconnected = function (errorCode, errorText) {
		this._trace("Client._disconnected", errorCode, errorText);
		
		this.sendPinger.cancel();
		this.receivePinger.cancel();
		if (this._connectTimeout)
			{ this._connectTimeout.cancel(); }
		// Clear message buffers.
		this._msg_queue = [];
		this._notify_msg_sent = {};
	   
		if (this.socket) {
			// Cancel all socket callbacks so that they cannot be driven again by this socket.
			this.socket.onopen = null;
			this.socket.onmessage = null;
			this.socket.onerror = null;
			this.socket.onclose = null;
			if (this.socket.readyState === 1)
				{ this.socket.close(); }
			delete this.socket;           
		}
		
		if (this.connectOptions.uris && this.hostIndex < this.connectOptions.uris.length-1) {
			// Try the next host.
			this.hostIndex++;
			this._doConnect(this.connectOptions.uris[this.hostIndex]);
		
		} else {
		
			if (errorCode === undefined) {
				errorCode = ERROR.OK.code;
				errorText = format(ERROR.OK);
			}
			
			// Run any application callbacks last as they may attempt to reconnect and hence create a new socket.
			if (this.connected) {
				this.connected = false;
				// Execute the connectionLostCallback if there is one, and we were connected.       
				if (this.onConnectionLost)
					{ this.onConnectionLost({errorCode:errorCode, errorMessage:errorText}); }      	
			} else {
				// Otherwise we never had a connection, so indicate that the connect has failed.
				if (this.connectOptions.mqttVersion === 4 && this.connectOptions.mqttVersionExplicit === false) {
					this._trace("Failed to connect V4, dropping back to V3");
					this.connectOptions.mqttVersion = 3;
					if (this.connectOptions.uris) {
						this.hostIndex = 0;
						this._doConnect(this.connectOptions.uris[0]);  
					} else {
						this._doConnect(this.uri);
					}	
				} else if(this.connectOptions.onFailure) {
					this.connectOptions.onFailure({invocationContext:this.connectOptions.invocationContext, errorCode:errorCode, errorMessage:errorText});
				}
			}
		}
	};

	/** @ignore */
	ClientImpl.prototype._trace = function () {
		var arguments$1 = arguments;
		var this$1 = this;

		// Pass trace message back to client's callback function
		if (this.traceFunction) {
			for (var i in arguments)
			{	
				if (typeof arguments$1[i] !== "undefined")
					{ arguments$1[i] = JSON.stringify(arguments$1[i]); }
			}
			var record = Array.prototype.slice.call(arguments).join("");
			this.traceFunction ({severity: "Debug", message: record	});
		}

		//buffer style trace
		if ( this._traceBuffer !== null ) {  
			for (var i = 0, max = arguments.length; i < max; i++) {
				if ( this$1._traceBuffer.length == this$1._MAX_TRACE_ENTRIES ) {    
					this$1._traceBuffer.shift();              
				}
				if (i === 0) { this$1._traceBuffer.push(arguments$1[i]); }
				else if (typeof arguments$1[i] === "undefined" ) { this$1._traceBuffer.push(arguments$1[i]); }
				else { this$1._traceBuffer.push("  "+JSON.stringify(arguments$1[i])); }
		   }
		}
	};
	
	/** @ignore */
	ClientImpl.prototype._traceMask = function (traceObject, masked) {
		var traceObjectMasked = {};
		for (var attr in traceObject) {
			if (traceObject.hasOwnProperty(attr)) {
				if (attr == masked) 
					{ traceObjectMasked[attr] = "******"; }
				else
					{ traceObjectMasked[attr] = traceObject[attr]; }
			} 
		}
		return traceObjectMasked;
	};

	// ------------------------------------------------------------------------
	// Public Programming interface.
	// ------------------------------------------------------------------------
	
	/** 
	 * The JavaScript application communicates to the server using a {@link Paho.MQTT.Client} object. 
	 * <p>
	 * Most applications will create just one Client object and then call its connect() method,
	 * however applications can create more than one Client object if they wish. 
	 * In this case the combination of host, port and clientId attributes must be different for each Client object.
	 * <p>
	 * The send, subscribe and unsubscribe methods are implemented as asynchronous JavaScript methods 
	 * (even though the underlying protocol exchange might be synchronous in nature). 
	 * This means they signal their completion by calling back to the application, 
	 * via Success or Failure callback functions provided by the application on the method in question. 
	 * Such callbacks are called at most once per method invocation and do not persist beyond the lifetime 
	 * of the script that made the invocation.
	 * <p>
	 * In contrast there are some callback functions, most notably <i>onMessageArrived</i>, 
	 * that are defined on the {@link Paho.MQTT.Client} object.  
	 * These may get called multiple times, and aren't directly related to specific method invocations made by the client. 
	 *
	 * @name Paho.MQTT.Client    
	 * 
	 * @constructor
	 *  
	 * @param {string} host - the address of the messaging server, as a fully qualified WebSocket URI, as a DNS name or dotted decimal IP address.
	 * @param {number} port - the port number to connect to - only required if host is not a URI
	 * @param {string} path - the path on the host to connect to - only used if host is not a URI. Default: '/mqtt'.
	 * @param {string} clientId - the Messaging client identifier, between 1 and 23 characters in length.
	 * 
	 * @property {string} host - <i>read only</i> the server's DNS hostname or dotted decimal IP address.
	 * @property {number} port - <i>read only</i> the server's port.
	 * @property {string} path - <i>read only</i> the server's path.
	 * @property {string} clientId - <i>read only</i> used when connecting to the server.
	 * @property {function} onConnectionLost - called when a connection has been lost. 
	 *                            after a connect() method has succeeded.
	 *                            Establish the call back used when a connection has been lost. The connection may be
	 *                            lost because the client initiates a disconnect or because the server or network 
	 *                            cause the client to be disconnected. The disconnect call back may be called without 
	 *                            the connectionComplete call back being invoked if, for example the client fails to 
	 *                            connect.
	 *                            A single response object parameter is passed to the onConnectionLost callback containing the following fields:
	 *                            <ol>   
	 *                            <li>errorCode
	 *                            <li>errorMessage       
	 *                            </ol>
	 * @property {function} onMessageDelivered called when a message has been delivered. 
	 *                            All processing that this Client will ever do has been completed. So, for example,
	 *                            in the case of a Qos=2 message sent by this client, the PubComp flow has been received from the server
	 *                            and the message has been removed from persistent storage before this callback is invoked. 
	 *                            Parameters passed to the onMessageDelivered callback are:
	 *                            <ol>   
	 *                            <li>{@link Paho.MQTT.Message} that was delivered.
	 *                            </ol>    
	 * @property {function} onMessageArrived called when a message has arrived in this Paho.MQTT.client. 
	 *                            Parameters passed to the onMessageArrived callback are:
	 *                            <ol>   
	 *                            <li>{@link Paho.MQTT.Message} that has arrived.
	 *                            </ol>    
	 */
	var Client = function (host, port, path, clientId) {
	    
	    var uri;
	    
		if (typeof host !== "string")
			{ throw new Error(format(ERROR.INVALID_TYPE, [typeof host, "host"])); }
	    
	    if (arguments.length == 2) {
	        // host: must be full ws:// uri
	        // port: clientId
	        clientId = port;
	        uri = host;
	        var match = uri.match(/^(wss?):\/\/((\[(.+)\])|([^\/]+?))(:(\d+))?(\/.*)$/);
	        if (match) {
	            host = match[4]||match[2];
	            port = parseInt(match[7]);
	            path = match[8];
	        } else {
	            throw new Error(format(ERROR.INVALID_ARGUMENT,[host,"host"]));
	        }
	    } else {
	        if (arguments.length == 3) {
				clientId = path;
				path = "/mqtt";
			}
			if (typeof port !== "number" || port < 0)
				{ throw new Error(format(ERROR.INVALID_TYPE, [typeof port, "port"])); }
			if (typeof path !== "string")
				{ throw new Error(format(ERROR.INVALID_TYPE, [typeof path, "path"])); }
			
			var ipv6AddSBracket = (host.indexOf(":") != -1 && host.slice(0,1) != "[" && host.slice(-1) != "]");
			uri = "ws://"+(ipv6AddSBracket?"["+host+"]":host)+":"+port+path;
		}

		var clientIdLength = 0;
		for (var i = 0; i<clientId.length; i++) {
			var charCode = clientId.charCodeAt(i);                   
			if (0xD800 <= charCode && charCode <= 0xDBFF)  {    			
				 i++; // Surrogate pair.
			}   		   
			clientIdLength++;
		}     	   	
		if (typeof clientId !== "string" || clientIdLength > 65535)
			{ throw new Error(format(ERROR.INVALID_ARGUMENT, [clientId, "clientId"])); } 
		
		var client = new ClientImpl(uri, host, port, path, clientId);
		this._getHost =  function() { return host; };
		this._setHost = function() { throw new Error(format(ERROR.UNSUPPORTED_OPERATION)); };
			
		this._getPort = function() { return port; };
		this._setPort = function() { throw new Error(format(ERROR.UNSUPPORTED_OPERATION)); };

		this._getPath = function() { return path; };
		this._setPath = function() { throw new Error(format(ERROR.UNSUPPORTED_OPERATION)); };

		this._getURI = function() { return uri; };
		this._setURI = function() { throw new Error(format(ERROR.UNSUPPORTED_OPERATION)); };
		
		this._getClientId = function() { return client.clientId; };
		this._setClientId = function() { throw new Error(format(ERROR.UNSUPPORTED_OPERATION)); };
		
		this._getOnConnectionLost = function() { return client.onConnectionLost; };
		this._setOnConnectionLost = function(newOnConnectionLost) { 
			if (typeof newOnConnectionLost === "function")
				{ client.onConnectionLost = newOnConnectionLost; }
			else 
				{ throw new Error(format(ERROR.INVALID_TYPE, [typeof newOnConnectionLost, "onConnectionLost"])); }
		};

		this._getOnMessageDelivered = function() { return client.onMessageDelivered; };
		this._setOnMessageDelivered = function(newOnMessageDelivered) { 
			if (typeof newOnMessageDelivered === "function")
				{ client.onMessageDelivered = newOnMessageDelivered; }
			else 
				{ throw new Error(format(ERROR.INVALID_TYPE, [typeof newOnMessageDelivered, "onMessageDelivered"])); }
		};
	   
		this._getOnMessageArrived = function() { return client.onMessageArrived; };
		this._setOnMessageArrived = function(newOnMessageArrived) { 
			if (typeof newOnMessageArrived === "function")
				{ client.onMessageArrived = newOnMessageArrived; }
			else 
				{ throw new Error(format(ERROR.INVALID_TYPE, [typeof newOnMessageArrived, "onMessageArrived"])); }
		};

		this._getTrace = function() { return client.traceFunction; };
		this._setTrace = function(trace) {
			if(typeof trace === "function"){
				client.traceFunction = trace;
			}else{
				throw new Error(format(ERROR.INVALID_TYPE, [typeof trace, "onTrace"]));
			}
		};
		
		/** 
		 * Connect this Messaging client to its server. 
		 * 
		 * @name Paho.MQTT.Client#connect
		 * @function
		 * @param {Object} connectOptions - attributes used with the connection. 
		 * @param {number} connectOptions.timeout - If the connect has not succeeded within this 
		 *                    number of seconds, it is deemed to have failed.
		 *                    The default is 30 seconds.
		 * @param {string} connectOptions.userName - Authentication username for this connection.
		 * @param {string} connectOptions.password - Authentication password for this connection.
		 * @param {Paho.MQTT.Message} connectOptions.willMessage - sent by the server when the client
		 *                    disconnects abnormally.
		 * @param {Number} connectOptions.keepAliveInterval - the server disconnects this client if
		 *                    there is no activity for this number of seconds.
		 *                    The default value of 60 seconds is assumed if not set.
		 * @param {boolean} connectOptions.cleanSession - if true(default) the client and server 
		 *                    persistent state is deleted on successful connect.
		 * @param {boolean} connectOptions.useSSL - if present and true, use an SSL Websocket connection.
		 * @param {object} connectOptions.invocationContext - passed to the onSuccess callback or onFailure callback.
		 * @param {function} connectOptions.onSuccess - called when the connect acknowledgement 
		 *                    has been received from the server.
		 * A single response object parameter is passed to the onSuccess callback containing the following fields:
		 * <ol>
		 * <li>invocationContext as passed in to the onSuccess method in the connectOptions.       
		 * </ol>
		 * @config {function} [onFailure] called when the connect request has failed or timed out.
		 * A single response object parameter is passed to the onFailure callback containing the following fields:
		 * <ol>
		 * <li>invocationContext as passed in to the onFailure method in the connectOptions.       
		 * <li>errorCode a number indicating the nature of the error.
		 * <li>errorMessage text describing the error.      
		 * </ol>
		 * @config {Array} [hosts] If present this contains either a set of hostnames or fully qualified
		 * WebSocket URIs (ws://example.com:1883/mqtt), that are tried in order in place 
		 * of the host and port paramater on the construtor. The hosts are tried one at at time in order until
		 * one of then succeeds.
		 * @config {Array} [ports] If present the set of ports matching the hosts. If hosts contains URIs, this property
		 * is not used.
		 * @throws {InvalidState} if the client is not in disconnected state. The client must have received connectionLost
		 * or disconnected before calling connect for a second or subsequent time.
		 */
		this.connect = function (connectOptions) {
			connectOptions = connectOptions || {} ;
			validate(connectOptions,  {timeout:"number",
									   userName:"string", 
									   password:"string", 
									   willMessage:"object", 
									   keepAliveInterval:"number", 
									   cleanSession:"boolean", 
									   useSSL:"boolean",
									   invocationContext:"object", 
									   onSuccess:"function", 
									   onFailure:"function",
									   hosts:"object",
									   ports:"object",
									   mqttVersion:"number",
									   mqttVersionExplicit:"boolean",
									   uris: "object"});
			
			// If no keep alive interval is set, assume 60 seconds.
			if (connectOptions.keepAliveInterval === undefined)
				{ connectOptions.keepAliveInterval = 60; }

			if (connectOptions.mqttVersion > 4 || connectOptions.mqttVersion < 3) {
				throw new Error(format(ERROR.INVALID_ARGUMENT, [connectOptions.mqttVersion, "connectOptions.mqttVersion"]));
			}

			if (connectOptions.mqttVersion === undefined) {
				connectOptions.mqttVersionExplicit = false;
				connectOptions.mqttVersion = 4;
			} else {
				connectOptions.mqttVersionExplicit = true;
			}

			//Check that if password is set, so is username
			if (connectOptions.password !== undefined && connectOptions.userName === undefined)
				{ throw new Error(format(ERROR.INVALID_ARGUMENT, [connectOptions.password, "connectOptions.password"])) }

			if (connectOptions.willMessage) {
				if (!(connectOptions.willMessage instanceof Message))
					{ throw new Error(format(ERROR.INVALID_TYPE, [connectOptions.willMessage, "connectOptions.willMessage"])); }
				// The will message must have a payload that can be represented as a string.
				// Cause the willMessage to throw an exception if this is not the case.
				connectOptions.willMessage.stringPayload;
				
				if (typeof connectOptions.willMessage.destinationName === "undefined")
					{ throw new Error(format(ERROR.INVALID_TYPE, [typeof connectOptions.willMessage.destinationName, "connectOptions.willMessage.destinationName"])); }
			}
			if (typeof connectOptions.cleanSession === "undefined")
				{ connectOptions.cleanSession = true; }
			if (connectOptions.hosts) {
			    
				if (!(connectOptions.hosts instanceof Array) )
					{ throw new Error(format(ERROR.INVALID_ARGUMENT, [connectOptions.hosts, "connectOptions.hosts"])); }
				if (connectOptions.hosts.length <1 )
					{ throw new Error(format(ERROR.INVALID_ARGUMENT, [connectOptions.hosts, "connectOptions.hosts"])); }
				
				var usingURIs = false;
				for (var i = 0; i<connectOptions.hosts.length; i++) {
					if (typeof connectOptions.hosts[i] !== "string")
						{ throw new Error(format(ERROR.INVALID_TYPE, [typeof connectOptions.hosts[i], "connectOptions.hosts["+i+"]"])); }
					if (/^(wss?):\/\/((\[(.+)\])|([^\/]+?))(:(\d+))?(\/.*)$/.test(connectOptions.hosts[i])) {
						if (i == 0) {
							usingURIs = true;
						} else if (!usingURIs) {
							throw new Error(format(ERROR.INVALID_ARGUMENT, [connectOptions.hosts[i], "connectOptions.hosts["+i+"]"]));
						}
					} else if (usingURIs) {
						throw new Error(format(ERROR.INVALID_ARGUMENT, [connectOptions.hosts[i], "connectOptions.hosts["+i+"]"]));
					}
				}
				
				if (!usingURIs) {
					if (!connectOptions.ports)
						{ throw new Error(format(ERROR.INVALID_ARGUMENT, [connectOptions.ports, "connectOptions.ports"])); }
					if (!(connectOptions.ports instanceof Array) )
						{ throw new Error(format(ERROR.INVALID_ARGUMENT, [connectOptions.ports, "connectOptions.ports"])); }
					if (connectOptions.hosts.length != connectOptions.ports.length)
						{ throw new Error(format(ERROR.INVALID_ARGUMENT, [connectOptions.ports, "connectOptions.ports"])); }
					
					connectOptions.uris = [];
					
					for (var i = 0; i<connectOptions.hosts.length; i++) {
						if (typeof connectOptions.ports[i] !== "number" || connectOptions.ports[i] < 0)
							{ throw new Error(format(ERROR.INVALID_TYPE, [typeof connectOptions.ports[i], "connectOptions.ports["+i+"]"])); }
						var host = connectOptions.hosts[i];
						var port = connectOptions.ports[i];
						
						var ipv6 = (host.indexOf(":") != -1);
						uri = "ws://"+(ipv6?"["+host+"]":host)+":"+port+path;
						connectOptions.uris.push(uri);
					}
				} else {
					connectOptions.uris = connectOptions.hosts;
				}
			}
			
			client.connect(connectOptions);
		};
	 
		/** 
		 * Subscribe for messages, request receipt of a copy of messages sent to the destinations described by the filter.
		 * 
		 * @name Paho.MQTT.Client#subscribe
		 * @function
		 * @param {string} filter describing the destinations to receive messages from.
		 * <br>
		 * @param {object} subscribeOptions - used to control the subscription
		 *
		 * @param {number} subscribeOptions.qos - the maiximum qos of any publications sent 
		 *                                  as a result of making this subscription.
		 * @param {object} subscribeOptions.invocationContext - passed to the onSuccess callback 
		 *                                  or onFailure callback.
		 * @param {function} subscribeOptions.onSuccess - called when the subscribe acknowledgement
		 *                                  has been received from the server.
		 *                                  A single response object parameter is passed to the onSuccess callback containing the following fields:
		 *                                  <ol>
		 *                                  <li>invocationContext if set in the subscribeOptions.       
		 *                                  </ol>
		 * @param {function} subscribeOptions.onFailure - called when the subscribe request has failed or timed out.
		 *                                  A single response object parameter is passed to the onFailure callback containing the following fields:
		 *                                  <ol>
		 *                                  <li>invocationContext - if set in the subscribeOptions.       
		 *                                  <li>errorCode - a number indicating the nature of the error.
		 *                                  <li>errorMessage - text describing the error.      
		 *                                  </ol>
		 * @param {number} subscribeOptions.timeout - which, if present, determines the number of
		 *                                  seconds after which the onFailure calback is called.
		 *                                  The presence of a timeout does not prevent the onSuccess
		 *                                  callback from being called when the subscribe completes.         
		 * @throws {InvalidState} if the client is not in connected state.
		 */
		this.subscribe = function (filter, subscribeOptions) {
			if (typeof filter !== "string")
				{ throw new Error("Invalid argument:"+filter); }
			subscribeOptions = subscribeOptions || {} ;
			validate(subscribeOptions,  {qos:"number", 
										 invocationContext:"object", 
										 onSuccess:"function", 
										 onFailure:"function",
										 timeout:"number"
										});
			if (subscribeOptions.timeout && !subscribeOptions.onFailure)
				{ throw new Error("subscribeOptions.timeout specified with no onFailure callback."); }
			if (typeof subscribeOptions.qos !== "undefined" 
				&& !(subscribeOptions.qos === 0 || subscribeOptions.qos === 1 || subscribeOptions.qos === 2 ))
				{ throw new Error(format(ERROR.INVALID_ARGUMENT, [subscribeOptions.qos, "subscribeOptions.qos"])); }
			client.subscribe(filter, subscribeOptions);
		};

		/**
		 * Unsubscribe for messages, stop receiving messages sent to destinations described by the filter.
		 * 
		 * @name Paho.MQTT.Client#unsubscribe
		 * @function
		 * @param {string} filter - describing the destinations to receive messages from.
		 * @param {object} unsubscribeOptions - used to control the subscription
		 * @param {object} unsubscribeOptions.invocationContext - passed to the onSuccess callback 
		                                      or onFailure callback.
		 * @param {function} unsubscribeOptions.onSuccess - called when the unsubscribe acknowledgement has been received from the server.
		 *                                    A single response object parameter is passed to the 
		 *                                    onSuccess callback containing the following fields:
		 *                                    <ol>
		 *                                    <li>invocationContext - if set in the unsubscribeOptions.     
		 *                                    </ol>
		 * @param {function} unsubscribeOptions.onFailure called when the unsubscribe request has failed or timed out.
		 *                                    A single response object parameter is passed to the onFailure callback containing the following fields:
		 *                                    <ol>
		 *                                    <li>invocationContext - if set in the unsubscribeOptions.       
		 *                                    <li>errorCode - a number indicating the nature of the error.
		 *                                    <li>errorMessage - text describing the error.      
		 *                                    </ol>
		 * @param {number} unsubscribeOptions.timeout - which, if present, determines the number of seconds
		 *                                    after which the onFailure callback is called. The presence of
		 *                                    a timeout does not prevent the onSuccess callback from being
		 *                                    called when the unsubscribe completes
		 * @throws {InvalidState} if the client is not in connected state.
		 */
		this.unsubscribe = function (filter, unsubscribeOptions) {
			if (typeof filter !== "string")
				{ throw new Error("Invalid argument:"+filter); }
			unsubscribeOptions = unsubscribeOptions || {} ;
			validate(unsubscribeOptions,  {invocationContext:"object", 
										   onSuccess:"function", 
										   onFailure:"function",
										   timeout:"number"
										  });
			if (unsubscribeOptions.timeout && !unsubscribeOptions.onFailure)
				{ throw new Error("unsubscribeOptions.timeout specified with no onFailure callback."); }
			client.unsubscribe(filter, unsubscribeOptions);
		};

		/**
		 * Send a message to the consumers of the destination in the Message.
		 * 
		 * @name Paho.MQTT.Client#send
		 * @function 
		 * @param {string|Paho.MQTT.Message} topic - <b>mandatory</b> The name of the destination to which the message is to be sent. 
		 * 					   - If it is the only parameter, used as Paho.MQTT.Message object.
		 * @param {String|ArrayBuffer} payload - The message data to be sent. 
		 * @param {number} qos The Quality of Service used to deliver the message.
		 * 		<dl>
		 * 			<dt>0 Best effort (default).
		 *     			<dt>1 At least once.
		 *     			<dt>2 Exactly once.     
		 * 		</dl>
		 * @param {Boolean} retained If true, the message is to be retained by the server and delivered 
		 *                     to both current and future subscriptions.
		 *                     If false the server only delivers the message to current subscribers, this is the default for new Messages. 
		 *                     A received message has the retained boolean set to true if the message was published 
		 *                     with the retained boolean set to true
		 *                     and the subscrption was made after the message has been published. 
		 * @throws {InvalidState} if the client is not connected.
		 */   
		this.send = function (topic,payload,qos,retained) {   
			var message;  
			
			if(arguments.length == 0){
				throw new Error("Invalid argument."+"length");

			}else if(arguments.length == 1) {

				if (!(topic instanceof Message) && (typeof topic !== "string"))
					{ throw new Error("Invalid argument:"+ typeof topic); }

				message = topic;
				if (typeof message.destinationName === "undefined")
					{ throw new Error(format(ERROR.INVALID_ARGUMENT,[message.destinationName,"Message.destinationName"])); }
				client.send(message); 

			}else {
				//parameter checking in Message object 
				message = new Message(payload);
				message.destinationName = topic;
				if(arguments.length >= 3)
					{ message.qos = qos; }
				if(arguments.length >= 4)
					{ message.retained = retained; }
				client.send(message); 
			}
		};
		
		/** 
		 * Normal disconnect of this Messaging client from its server.
		 * 
		 * @name Paho.MQTT.Client#disconnect
		 * @function
		 * @throws {InvalidState} if the client is already disconnected.     
		 */
		this.disconnect = function () {
			client.disconnect();
		};
		
		/** 
		 * Get the contents of the trace log.
		 * 
		 * @name Paho.MQTT.Client#getTraceLog
		 * @function
		 * @return {Object[]} tracebuffer containing the time ordered trace records.
		 */
		this.getTraceLog = function () {
			return client.getTraceLog();
		};
		
		/** 
		 * Start tracing.
		 * 
		 * @name Paho.MQTT.Client#startTrace
		 * @function
		 */
		this.startTrace = function () {
			client.startTrace();
		};
		
		/** 
		 * Stop tracing.
		 * 
		 * @name Paho.MQTT.Client#stopTrace
		 * @function
		 */
		this.stopTrace = function () {
			client.stopTrace();
		};

		this.isConnected = function() {
			return client.connected;
		};
	};

	Client.prototype = {
		get host() { return this._getHost(); },
		set host(newHost) { this._setHost(newHost); },
			
		get port() { return this._getPort(); },
		set port(newPort) { this._setPort(newPort); },

		get path() { return this._getPath(); },
		set path(newPath) { this._setPath(newPath); },
			
		get clientId() { return this._getClientId(); },
		set clientId(newClientId) { this._setClientId(newClientId); },

		get onConnectionLost() { return this._getOnConnectionLost(); },
		set onConnectionLost(newOnConnectionLost) { this._setOnConnectionLost(newOnConnectionLost); },

		get onMessageDelivered() { return this._getOnMessageDelivered(); },
		set onMessageDelivered(newOnMessageDelivered) { this._setOnMessageDelivered(newOnMessageDelivered); },
		
		get onMessageArrived() { return this._getOnMessageArrived(); },
		set onMessageArrived(newOnMessageArrived) { this._setOnMessageArrived(newOnMessageArrived); },

		get trace() { return this._getTrace(); },
		set trace(newTraceFunction) { this._setTrace(newTraceFunction); }	

	};
	
	/** 
	 * An application message, sent or received.
	 * <p>
	 * All attributes may be null, which implies the default values.
	 * 
	 * @name Paho.MQTT.Message
	 * @constructor
	 * @param {String|ArrayBuffer} payload The message data to be sent.
	 * <p>
	 * @property {string} payloadString <i>read only</i> The payload as a string if the payload consists of valid UTF-8 characters.
	 * @property {ArrayBuffer} payloadBytes <i>read only</i> The payload as an ArrayBuffer.
	 * <p>
	 * @property {string} destinationName <b>mandatory</b> The name of the destination to which the message is to be sent
	 *                    (for messages about to be sent) or the name of the destination from which the message has been received.
	 *                    (for messages received by the onMessage function).
	 * <p>
	 * @property {number} qos The Quality of Service used to deliver the message.
	 * <dl>
	 *     <dt>0 Best effort (default).
	 *     <dt>1 At least once.
	 *     <dt>2 Exactly once.     
	 * </dl>
	 * <p>
	 * @property {Boolean} retained If true, the message is to be retained by the server and delivered 
	 *                     to both current and future subscriptions.
	 *                     If false the server only delivers the message to current subscribers, this is the default for new Messages. 
	 *                     A received message has the retained boolean set to true if the message was published 
	 *                     with the retained boolean set to true
	 *                     and the subscrption was made after the message has been published. 
	 * <p>
	 * @property {Boolean} duplicate <i>read only</i> If true, this message might be a duplicate of one which has already been received. 
	 *                     This is only set on messages received from the server.
	 *                     
	 */
	var Message = function (newPayload) {  
		var payload;
		if (   typeof newPayload === "string" 
			|| newPayload instanceof ArrayBuffer
			|| newPayload instanceof Int8Array
			|| newPayload instanceof Uint8Array
			|| newPayload instanceof Int16Array
			|| newPayload instanceof Uint16Array
			|| newPayload instanceof Int32Array
			|| newPayload instanceof Uint32Array
			|| newPayload instanceof Float32Array
			|| newPayload instanceof Float64Array
		   ) {
			payload = newPayload;
		} else {
			throw (format(ERROR.INVALID_ARGUMENT, [newPayload, "newPayload"]));
		}

		this._getPayloadString = function () {
			if (typeof payload === "string")
				{ return payload; }
			else
				{ return parseUTF8(payload, 0, payload.length); } 
		};

		this._getPayloadBytes = function() {
			if (typeof payload === "string") {
				var buffer = new ArrayBuffer(UTF8Length(payload));
				var byteStream = new Uint8Array(buffer); 
				stringToUTF8(payload, byteStream, 0);

				return byteStream;
			} else {
				return payload;
			}
		};

		var destinationName = undefined;
		this._getDestinationName = function() { return destinationName; };
		this._setDestinationName = function(newDestinationName) { 
			if (typeof newDestinationName === "string")
				{ destinationName = newDestinationName; }
			else 
				{ throw new Error(format(ERROR.INVALID_ARGUMENT, [newDestinationName, "newDestinationName"])); }
		};
				
		var qos = 0;
		this._getQos = function() { return qos; };
		this._setQos = function(newQos) { 
			if (newQos === 0 || newQos === 1 || newQos === 2 )
				{ qos = newQos; }
			else 
				{ throw new Error("Invalid argument:"+newQos); }
		};

		var retained = false;
		this._getRetained = function() { return retained; };
		this._setRetained = function(newRetained) { 
			if (typeof newRetained === "boolean")
				{ retained = newRetained; }
			else 
				{ throw new Error(format(ERROR.INVALID_ARGUMENT, [newRetained, "newRetained"])); }
		};
		
		var duplicate = false;
		this._getDuplicate = function() { return duplicate; };
		this._setDuplicate = function(newDuplicate) { duplicate = newDuplicate; };
	};
	
	Message.prototype = {
		get payloadString() { return this._getPayloadString(); },
		get payloadBytes() { return this._getPayloadBytes(); },
		
		get destinationName() { return this._getDestinationName(); },
		set destinationName(newDestinationName) { this._setDestinationName(newDestinationName); },
		
		get qos() { return this._getQos(); },
		set qos(newQos) { this._setQos(newQos); },

		get retained() { return this._getRetained(); },
		set retained(newRetained) { this._setRetained(newRetained); },

		get duplicate() { return this._getDuplicate(); },
		set duplicate(newDuplicate) { this._setDuplicate(newDuplicate); }
	};
	   
	// Module contents.
	return {
		Client: Client,
		Message: Message
	};
})(window);

var commonjsGlobal = typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

function commonjsRequire () {
	throw new Error('Dynamic requires are not currently supported by rollup-plugin-commonjs');
}



function createCommonjsModule(fn, module) {
	return module = { exports: {} }, fn(module, module.exports), module.exports;
}

/**
 * Helpers.
 */

var s = 1000;
var m = s * 60;
var h = m * 60;
var d = h * 24;
var y = d * 365.25;

/**
 * Parse or format the given `val`.
 *
 * Options:
 *
 *  - `long` verbose formatting [false]
 *
 * @param {String|Number} val
 * @param {Object} options
 * @throws {Error} throw an error if val is not a non-empty string or a number
 * @return {String|Number}
 * @api public
 */

var index = function (val, options) {
  options = options || {};
  var type = typeof val;
  if (type === 'string' && val.length > 0) {
    return parse(val)
  } else if (type === 'number' && isNaN(val) === false) {
    return options.long ?
			fmtLong(val) :
			fmtShort(val)
  }
  throw new Error('val is not a non-empty string or a valid number. val=' + JSON.stringify(val))
};

/**
 * Parse the given `str` and return milliseconds.
 *
 * @param {String} str
 * @return {Number}
 * @api private
 */

function parse(str) {
  str = String(str);
  if (str.length > 10000) {
    return
  }
  var match = /^((?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|years?|yrs?|y)?$/i.exec(str);
  if (!match) {
    return
  }
  var n = parseFloat(match[1]);
  var type = (match[2] || 'ms').toLowerCase();
  switch (type) {
    case 'years':
    case 'year':
    case 'yrs':
    case 'yr':
    case 'y':
      return n * y
    case 'days':
    case 'day':
    case 'd':
      return n * d
    case 'hours':
    case 'hour':
    case 'hrs':
    case 'hr':
    case 'h':
      return n * h
    case 'minutes':
    case 'minute':
    case 'mins':
    case 'min':
    case 'm':
      return n * m
    case 'seconds':
    case 'second':
    case 'secs':
    case 'sec':
    case 's':
      return n * s
    case 'milliseconds':
    case 'millisecond':
    case 'msecs':
    case 'msec':
    case 'ms':
      return n
    default:
      return undefined
  }
}

/**
 * Short format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function fmtShort(ms) {
  if (ms >= d) {
    return Math.round(ms / d) + 'd'
  }
  if (ms >= h) {
    return Math.round(ms / h) + 'h'
  }
  if (ms >= m) {
    return Math.round(ms / m) + 'm'
  }
  if (ms >= s) {
    return Math.round(ms / s) + 's'
  }
  return ms + 'ms'
}

/**
 * Long format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function fmtLong(ms) {
  return plural(ms, d, 'day') ||
    plural(ms, h, 'hour') ||
    plural(ms, m, 'minute') ||
    plural(ms, s, 'second') ||
    ms + ' ms'
}

/**
 * Pluralization helper.
 */

function plural(ms, n, name) {
  if (ms < n) {
    return
  }
  if (ms < n * 1.5) {
    return Math.floor(ms / n) + ' ' + name
  }
  return Math.ceil(ms / n) + ' ' + name + 's'
}

var debug$1 = createCommonjsModule(function (module, exports) {
/**
 * This is the common logic for both the Node.js and web browser
 * implementations of `debug()`.
 *
 * Expose `debug()` as the module.
 */

exports = module.exports = createDebug.debug = createDebug['default'] = createDebug;
exports.coerce = coerce;
exports.disable = disable;
exports.enable = enable;
exports.enabled = enabled;
exports.humanize = index;

/**
 * The currently active debug mode names, and names to skip.
 */

exports.names = [];
exports.skips = [];

/**
 * Map of special "%n" handling functions, for the debug "format" argument.
 *
 * Valid key names are a single, lower or upper-case letter, i.e. "n" and "N".
 */

exports.formatters = {};

/**
 * Previous log timestamp.
 */

var prevTime;

/**
 * Select a color.
 * @param {String} namespace
 * @return {Number}
 * @api private
 */

function selectColor(namespace) {
  var hash = 0, i;

  for (i in namespace) {
    hash  = ((hash << 5) - hash) + namespace.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }

  return exports.colors[Math.abs(hash) % exports.colors.length];
}

/**
 * Create a debugger with the given `namespace`.
 *
 * @param {String} namespace
 * @return {Function}
 * @api public
 */

function createDebug(namespace) {

  function debug() {
    var arguments$1 = arguments;

    // disabled?
    if (!debug.enabled) { return; }

    var self = debug;

    // set `diff` timestamp
    var curr = +new Date();
    var ms = curr - (prevTime || curr);
    self.diff = ms;
    self.prev = prevTime;
    self.curr = curr;
    prevTime = curr;

    // turn the `arguments` into a proper Array
    var args = new Array(arguments.length);
    for (var i = 0; i < args.length; i++) {
      args[i] = arguments$1[i];
    }

    args[0] = exports.coerce(args[0]);

    if ('string' !== typeof args[0]) {
      // anything else let's inspect with %O
      args.unshift('%O');
    }

    // apply any `formatters` transformations
    var index$$1 = 0;
    args[0] = args[0].replace(/%([a-zA-Z%])/g, function(match, format) {
      // if we encounter an escaped % then don't increase the array index
      if (match === '%%') { return match; }
      index$$1++;
      var formatter = exports.formatters[format];
      if ('function' === typeof formatter) {
        var val = args[index$$1];
        match = formatter.call(self, val);

        // now we need to remove `args[index]` since it's inlined in the `format`
        args.splice(index$$1, 1);
        index$$1--;
      }
      return match;
    });

    // apply env-specific formatting (colors, etc.)
    exports.formatArgs.call(self, args);

    var logFn = debug.log || exports.log || console.log.bind(console);
    logFn.apply(self, args);
  }

  debug.namespace = namespace;
  debug.enabled = exports.enabled(namespace);
  debug.useColors = exports.useColors();
  debug.color = selectColor(namespace);

  // env-specific initialization logic for debug instances
  if ('function' === typeof exports.init) {
    exports.init(debug);
  }

  return debug;
}

/**
 * Enables a debug mode by namespaces. This can include modes
 * separated by a colon and wildcards.
 *
 * @param {String} namespaces
 * @api public
 */

function enable(namespaces) {
  exports.save(namespaces);

  exports.names = [];
  exports.skips = [];

  var split = (namespaces || '').split(/[\s,]+/);
  var len = split.length;

  for (var i = 0; i < len; i++) {
    if (!split[i]) { continue; } // ignore empty strings
    namespaces = split[i].replace(/\*/g, '.*?');
    if (namespaces[0] === '-') {
      exports.skips.push(new RegExp('^' + namespaces.substr(1) + '$'));
    } else {
      exports.names.push(new RegExp('^' + namespaces + '$'));
    }
  }
}

/**
 * Disable debug output.
 *
 * @api public
 */

function disable() {
  exports.enable('');
}

/**
 * Returns true if the given mode name is enabled, false otherwise.
 *
 * @param {String} name
 * @return {Boolean}
 * @api public
 */

function enabled(name) {
  var i, len;
  for (i = 0, len = exports.skips.length; i < len; i++) {
    if (exports.skips[i].test(name)) {
      return false;
    }
  }
  for (i = 0, len = exports.names.length; i < len; i++) {
    if (exports.names[i].test(name)) {
      return true;
    }
  }
  return false;
}

/**
 * Coerce `val`.
 *
 * @param {Mixed} val
 * @return {Mixed}
 * @api private
 */

function coerce(val) {
  if (val instanceof Error) { return val.stack || val.message; }
  return val;
}
});

var browser$1 = createCommonjsModule(function (module, exports) {
/**
 * This is the web browser implementation of `debug()`.
 *
 * Expose `debug()` as the module.
 */

exports = module.exports = debug$1;
exports.log = log;
exports.formatArgs = formatArgs;
exports.save = save;
exports.load = load;
exports.useColors = useColors;
exports.storage = 'undefined' != typeof chrome
               && 'undefined' != typeof chrome.storage
                  ? chrome.storage.local
                  : localstorage();

/**
 * Colors.
 */

exports.colors = [
  'lightseagreen',
  'forestgreen',
  'goldenrod',
  'dodgerblue',
  'darkorchid',
  'crimson'
];

/**
 * Currently only WebKit-based Web Inspectors, Firefox >= v31,
 * and the Firebug extension (any Firefox version) are known
 * to support "%c" CSS customizations.
 *
 * TODO: add a `localStorage` variable to explicitly enable/disable colors
 */

function useColors() {
  // NB: In an Electron preload script, document will be defined but not fully
  // initialized. Since we know we're in Chrome, we'll just detect this case
  // explicitly
  if (typeof window !== 'undefined' && window && typeof window.process !== 'undefined' && window.process.type === 'renderer') {
    return true;
  }

  // is webkit? http://stackoverflow.com/a/16459606/376773
  // document is undefined in react-native: https://github.com/facebook/react-native/pull/1632
  return (typeof document !== 'undefined' && document && 'WebkitAppearance' in document.documentElement.style) ||
    // is firebug? http://stackoverflow.com/a/398120/376773
    (typeof window !== 'undefined' && window && window.console && (console.firebug || (console.exception && console.table))) ||
    // is firefox >= v31?
    // https://developer.mozilla.org/en-US/docs/Tools/Web_Console#Styling_messages
    (typeof navigator !== 'undefined' && navigator && navigator.userAgent && navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/) && parseInt(RegExp.$1, 10) >= 31) ||
    // double check webkit in userAgent just in case we are in a worker
    (typeof navigator !== 'undefined' && navigator && navigator.userAgent && navigator.userAgent.toLowerCase().match(/applewebkit\/(\d+)/));
}

/**
 * Map %j to `JSON.stringify()`, since no Web Inspectors do that by default.
 */

exports.formatters.j = function(v) {
  try {
    return JSON.stringify(v);
  } catch (err) {
    return '[UnexpectedJSONParseError]: ' + err.message;
  }
};


/**
 * Colorize log arguments if enabled.
 *
 * @api public
 */

function formatArgs(args) {
  var useColors = this.useColors;

  args[0] = (useColors ? '%c' : '')
    + this.namespace
    + (useColors ? ' %c' : ' ')
    + args[0]
    + (useColors ? '%c ' : ' ')
    + '+' + exports.humanize(this.diff);

  if (!useColors) { return; }

  var c = 'color: ' + this.color;
  args.splice(1, 0, c, 'color: inherit');

  // the final "%c" is somewhat tricky, because there could be other
  // arguments passed either before or after the %c, so we need to
  // figure out the correct index to insert the CSS into
  var index = 0;
  var lastC = 0;
  args[0].replace(/%[a-zA-Z%]/g, function(match) {
    if ('%%' === match) { return; }
    index++;
    if ('%c' === match) {
      // we only are interested in the *last* %c
      // (the user may have provided their own)
      lastC = index;
    }
  });

  args.splice(lastC, 0, c);
}

/**
 * Invokes `console.log()` when available.
 * No-op when `console.log` is not a "function".
 *
 * @api public
 */

function log() {
  // this hackery is required for IE8/9, where
  // the `console.log` function doesn't have 'apply'
  return 'object' === typeof console
    && console.log
    && Function.prototype.apply.call(console.log, console, arguments);
}

/**
 * Save `namespaces`.
 *
 * @param {String} namespaces
 * @api private
 */

function save(namespaces) {
  try {
    if (null == namespaces) {
      exports.storage.removeItem('debug');
    } else {
      exports.storage.debug = namespaces;
    }
  } catch(e) {}
}

/**
 * Load `namespaces`.
 *
 * @return {String} returns the previously persisted debug modes
 * @api private
 */

function load() {
  try {
    return exports.storage.debug;
  } catch(e) {}

  // If debug isn't set in LS, and we're in Electron, try to load $DEBUG
  if (typeof process !== 'undefined' && 'env' in process) {
    return process.env.DEBUG;
  }
}

/**
 * Enable namespaces listed in `localStorage.debug` initially.
 */

exports.enable(load());

/**
 * Localstorage attempts to return the localstorage.
 *
 * This is necessary because safari throws
 * when a user disables cookies/localstorage
 * and you attempt to access it.
 *
 * @return {LocalStorage}
 * @api private
 */

function localstorage() {
  try {
    return window.localStorage;
  } catch (e) {}
}
});

// returns a function that will match the given wildcard

var mtq_debug = browser$1('MQT');
var paho_debug = browser$1('MQT:PAHO');

var mqtt_min = createCommonjsModule(function (module, exports) {
(function(f){{module.exports=f();}})(function(){var define,module,exports;return function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof commonjsRequire=="function"&&commonjsRequire;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r);}return n[o].exports}var i=typeof commonjsRequire=="function"&&commonjsRequire;for(var o=0;o<r.length;o++)s(r[o]);return s}({1:[function(require,module,exports){(function(process,global){"use strict";var events=require("events");var Store=require("./store");var eos=require("end-of-stream");var mqttPacket=require("mqtt-packet");var Writable=require("readable-stream").Writable;var inherits=require("inherits");var reInterval=require("reinterval");var validations=require("./validations");var setImmediate=global.setImmediate||function(callback){process.nextTick(callback);};var defaultConnectOptions={keepalive:60,reschedulePings:true,protocolId:"MQTT",protocolVersion:4,reconnectPeriod:1e3,connectTimeout:30*1e3,clean:true};function defaultId(){return"mqttjs_"+Math.random().toString(16).substr(2,8)}function sendPacket(client,packet,cb){client.emit("packetsend",packet);var result=mqttPacket.writeToStream(packet,client.stream);if(!result&&cb){client.stream.once("drain",cb);}else if(cb){cb();}}function storeAndSend(client,packet,cb){client.outgoingStore.put(packet,function storedPacket(err){if(err){return cb&&cb(err)}sendPacket(client,packet,cb);});}function nop(){}function MqttClient(streamBuilder,options){var k;var that=this;if(!(this instanceof MqttClient)){return new MqttClient(streamBuilder,options)}this.options=options||{};for(k in defaultConnectOptions){if(typeof this.options[k]==="undefined"){this.options[k]=defaultConnectOptions[k];}else{this.options[k]=options[k];}}this.options.clientId=this.options.clientId||defaultId();this.streamBuilder=streamBuilder;this.outgoingStore=this.options.outgoingStore||new Store;this.incomingStore=this.options.incomingStore||new Store;this.queueQoSZero=this.options.queueQoSZero===undefined?true:this.options.queueQoSZero;this._subscribedTopics={};this.pingTimer=null;this.connected=false;this.disconnecting=false;this.queue=[];this.connackTimer=null;this.reconnectTimer=null;this.nextId=Math.floor(Math.random()*65535);this.outgoing={};this.on("connect",function(){if(this.disconnected){return}this.connected=true;var outStore=null;outStore=this.outgoingStore.createStream();outStore.once("readable",function(){function storeDeliver(){var packet=outStore.read(1);var cb;if(!packet){return}if(!that.disconnecting&&!that.reconnectTimer&&that.options.reconnectPeriod>0){outStore.read(0);cb=that.outgoing[packet.messageId];that.outgoing[packet.messageId]=function(err,status){if(cb){cb(err,status);}storeDeliver();};that._sendPacket(packet);}else if(outStore.destroy){outStore.destroy();}}storeDeliver();}).on("error",this.emit.bind(this,"error"));});this.on("close",function(){this.connected=false;clearTimeout(this.connackTimer);});this.on("connect",this._setupPingTimer);this.on("connect",function(){var queue=this.queue;function deliver(){var entry=queue.shift();var packet=null;if(!entry){return}packet=entry.packet;that._sendPacket(packet,function(err){if(entry.cb){entry.cb(err);}deliver();});}deliver();});this.on("connect",function(){if(this.options.clean&&Object.keys(this._subscribedTopics).length>0){this.subscribe(this._subscribedTopics);}});this.on("close",function(){if(that.pingTimer!==null){that.pingTimer.clear();that.pingTimer=null;}});this.on("close",this._setupReconnect);events.EventEmitter.call(this);this._setupStream();}inherits(MqttClient,events.EventEmitter);MqttClient.prototype._setupStream=function(){var connectPacket;var that=this;var writable=new Writable;var parser=mqttPacket.parser(this.options);var completeParse=null;var packets=[];this._clearReconnect();this.stream=this.streamBuilder(this);parser.on("packet",function(packet){packets.push(packet);});function process(){var packet=packets.shift();var done=completeParse;if(packet){that._handlePacket(packet,process);}else{completeParse=null;done();}}writable._write=function(buf,enc,done){completeParse=done;parser.parse(buf);process();};this.stream.pipe(writable);this.stream.on("error",nop);eos(this.stream,this.emit.bind(this,"close"));connectPacket=Object.create(this.options);connectPacket.cmd="connect";sendPacket(this,connectPacket);parser.on("error",this.emit.bind(this,"error"));this.stream.setMaxListeners(1e3);clearTimeout(this.connackTimer);this.connackTimer=setTimeout(function(){that._cleanUp(true);},this.options.connectTimeout);};MqttClient.prototype._handlePacket=function(packet,done){this.emit("packetreceive",packet);switch(packet.cmd){case"publish":this._handlePublish(packet,done);break;case"puback":case"pubrec":case"pubcomp":case"suback":case"unsuback":this._handleAck(packet);done();break;case"pubrel":this._handlePubrel(packet,done);break;case"connack":this._handleConnack(packet);done();break;case"pingresp":this._handlePingresp(packet);done();break;default:break}};MqttClient.prototype._checkDisconnecting=function(callback){if(this.disconnecting){if(callback){callback(new Error("client disconnecting"));}else{this.emit("error",new Error("client disconnecting"));}}return this.disconnecting};MqttClient.prototype.publish=function(topic,message,opts,callback){var packet;if(typeof opts==="function"){callback=opts;opts=null;}if(!opts){opts={qos:0,retain:false};}if(this._checkDisconnecting(callback)){return this}packet={cmd:"publish",topic:topic,payload:message,qos:opts.qos,retain:opts.retain,messageId:this._nextId()};switch(opts.qos){case 1:case 2:this.outgoing[packet.messageId]=callback||nop;this._sendPacket(packet);break;default:this._sendPacket(packet,callback);break}return this};MqttClient.prototype.subscribe=function(){var packet;var args=Array.prototype.slice.call(arguments);var subs=[];var obj=args.shift();var callback=args.pop()||nop;var opts=args.pop();var invalidTopic;var that=this;if(typeof obj==="string"){obj=[obj];}if(typeof callback!=="function"){opts=callback;callback=nop;}invalidTopic=validations.validateTopics(obj);if(invalidTopic!==null){setImmediate(callback,new Error("Invalid topic "+invalidTopic));return this}if(this._checkDisconnecting(callback)){return this}if(!opts){opts={qos:0};}if(Array.isArray(obj)){obj.forEach(function(topic){subs.push({topic:topic,qos:opts.qos});});}else{Object.keys(obj).forEach(function(k){subs.push({topic:k,qos:obj[k]});});}packet={cmd:"subscribe",subscriptions:subs,qos:1,retain:false,dup:false,messageId:this._nextId()};this.outgoing[packet.messageId]=function(err,packet){if(!err){subs.forEach(function(sub){that._subscribedTopics[sub.topic]=sub.qos;});var granted=packet.granted;for(var i=0;i<granted.length;i+=1){subs[i].qos=granted[i];}}callback(err,subs);};this._sendPacket(packet);return this};MqttClient.prototype.unsubscribe=function(topic,callback){var packet={cmd:"unsubscribe",qos:1,messageId:this._nextId()};var that=this;callback=callback||nop;if(this._checkDisconnecting(callback)){return this}if(typeof topic==="string"){packet.unsubscriptions=[topic];}else if(typeof topic==="object"&&topic.length){packet.unsubscriptions=topic;}packet.unsubscriptions.forEach(function(topic){delete that._subscribedTopics[topic];});this.outgoing[packet.messageId]=callback;this._sendPacket(packet);return this};MqttClient.prototype.end=function(force,cb){var that=this;if(typeof force==="function"){cb=force;force=false;}function closeStores(){that.disconnected=true;that.incomingStore.close(function(){that.outgoingStore.close(cb);});}function finish(){that._cleanUp(force,setImmediate.bind(null,closeStores));}if(this.disconnecting){return this}this._clearReconnect();this.disconnecting=true;if(!force&&Object.keys(this.outgoing).length>0){this.once("outgoingEmpty",setTimeout.bind(null,finish,10));}else{finish();}return this};MqttClient.prototype._reconnect=function(){this.emit("reconnect");this._setupStream();};MqttClient.prototype._setupReconnect=function(){var that=this;if(!that.disconnecting&&!that.reconnectTimer&&that.options.reconnectPeriod>0){if(!this.reconnecting){this.emit("offline");this.reconnecting=true;}that.reconnectTimer=setInterval(function(){that._reconnect();},that.options.reconnectPeriod);}};MqttClient.prototype._clearReconnect=function(){if(this.reconnectTimer){clearInterval(this.reconnectTimer);this.reconnectTimer=null;}};MqttClient.prototype._cleanUp=function(forced,done){if(done){this.stream.on("close",done);}if(forced){this.stream.destroy();}else{this._sendPacket({cmd:"disconnect"},setImmediate.bind(null,this.stream.end.bind(this.stream)));}if(!this.disconnecting){this._clearReconnect();this._setupReconnect();}if(this.pingTimer!==null){this.pingTimer.clear();this.pingTimer=null;}};MqttClient.prototype._sendPacket=function(packet,cb){if(!this.connected){if(packet.qos>0||packet.cmd!=="publish"||this.queueQoSZero){this.queue.push({packet:packet,cb:cb});}else if(cb){cb(new Error("No connection to broker"));}return}this._shiftPingInterval();if(packet.cmd!=="publish"){sendPacket(this,packet,cb);return}switch(packet.qos){case 2:case 1:storeAndSend(this,packet,cb);break;case 0:default:sendPacket(this,packet,cb);break}};MqttClient.prototype._setupPingTimer=function(){var that=this;if(!this.pingTimer&&this.options.keepalive){this.pingResp=true;this.pingTimer=reInterval(function(){that._checkPing();},this.options.keepalive*1e3);}};MqttClient.prototype._shiftPingInterval=function(){if(this.pingTimer&&this.options.keepalive&&this.options.reschedulePings){this.pingTimer.reschedule(this.options.keepalive*1e3);}};MqttClient.prototype._checkPing=function(){if(this.pingResp){this.pingResp=false;this._sendPacket({cmd:"pingreq"});}else{this._cleanUp(true);}};MqttClient.prototype._handlePingresp=function(){this.pingResp=true;};MqttClient.prototype._handleConnack=function(packet){var rc=packet.returnCode;var errors=["","Unacceptable protocol version","Identifier rejected","Server unavailable","Bad username or password","Not authorized"];clearTimeout(this.connackTimer);if(rc===0){this.reconnecting=false;this.emit("connect",packet);}else if(rc>0){this.emit("error",new Error("Connection refused: "+errors[rc]));}};MqttClient.prototype._handlePublish=function(packet,done){var topic=packet.topic.toString();var message=packet.payload;var qos=packet.qos;var mid=packet.messageId;var that=this;switch(qos){case 2:this.incomingStore.put(packet,function(){that._sendPacket({cmd:"pubrec",messageId:mid},done);});break;case 1:this._sendPacket({cmd:"puback",messageId:mid});case 0:this.emit("message",topic,message,packet);this.handleMessage(packet,done);break;default:break}};MqttClient.prototype.handleMessage=function(packet,callback){callback();};MqttClient.prototype._handleAck=function(packet){var mid=packet.messageId;var type=packet.cmd;var response=null;var cb=this.outgoing[mid];var that=this;if(!cb){return}switch(type){case"pubcomp":case"puback":delete this.outgoing[mid];this.outgoingStore.del(packet,cb);break;case"pubrec":response={cmd:"pubrel",qos:2,messageId:mid};this._sendPacket(response);break;case"suback":delete this.outgoing[mid];cb(null,packet);break;case"unsuback":delete this.outgoing[mid];cb(null);break;default:that.emit("error",new Error("unrecognized packet type"));}if(this.disconnecting&&Object.keys(this.outgoing).length===0){this.emit("outgoingEmpty");}};MqttClient.prototype._handlePubrel=function(packet,callback){var mid=packet.messageId;var that=this;that.incomingStore.get(packet,function(err,pub){if(err){return that.emit("error",err)}if(pub.cmd!=="pubrel"){that.emit("message",pub.topic,pub.payload,pub);that.incomingStore.put(packet);}that._sendPacket({cmd:"pubcomp",messageId:mid},callback);});};MqttClient.prototype._nextId=function(){var id=this.nextId++;if(id===65535){this.nextId=1;}return id};MqttClient.prototype.getLastMessageId=function(){return this.nextId===1?65535:this.nextId-1};module.exports=MqttClient;}).call(this,require("_process"),typeof commonjsGlobal!=="undefined"?commonjsGlobal:typeof self!=="undefined"?self:typeof window!=="undefined"?window:{});},{"./store":5,"./validations":6,_process:31,"end-of-stream":16,events:17,inherits:19,"mqtt-packet":24,"readable-stream":43,reinterval:45}],2:[function(require,module,exports){"use strict";var net=require("net");function buildBuilder(client,opts){var port,host;opts.port=opts.port||1883;opts.hostname=opts.hostname||opts.host||"localhost";port=opts.port;host=opts.hostname;return net.createConnection(port,host)}module.exports=buildBuilder;},{net:10}],3:[function(require,module,exports){"use strict";var tls=require("tls");function buildBuilder(mqttClient,opts){var connection;opts.port=opts.port||8883;opts.host=opts.hostname||opts.host||"localhost";opts.rejectUnauthorized=opts.rejectUnauthorized!==false;connection=tls.connect(opts);connection.on("secureConnect",function(){if(opts.rejectUnauthorized&&!connection.authorized){connection.emit("error",new Error("TLS not authorized"));}else{connection.removeListener("error",handleTLSerrors);}});function handleTLSerrors(err){if(opts.rejectUnauthorized){mqttClient.emit("error",err);}connection.end();}connection.on("error",handleTLSerrors);return connection}module.exports=buildBuilder;},{tls:10}],4:[function(require,module,exports){(function(process){"use strict";var websocket=require("websocket-stream");var urlModule=require("url");var WSS_OPTIONS=["rejectUnauthorized","ca","cert","key","pfx","passphrase"];var IS_BROWSER=process.title==="browser";function buildUrl(opts,client){var url=opts.protocol+"://"+opts.hostname+":"+opts.port+opts.path;if(typeof opts.transformWsUrl==="function"){url=opts.transformWsUrl(url,opts,client);}return url}function setDefaultOpts(opts){if(!opts.hostname){opts.hostname="localhost";}if(!opts.port){if(opts.protocol==="wss"){opts.port=443;}else{opts.port=80;}}if(!opts.path){opts.path="/";}if(!opts.wsOptions){opts.wsOptions={};}if(!IS_BROWSER&&opts.protocol==="wss"){WSS_OPTIONS.forEach(function(prop){if(opts.hasOwnProperty(prop)&&!opts.wsOptions.hasOwnProperty(prop)){opts.wsOptions[prop]=opts[prop];}});}}function createWebSocket(client,opts){var websocketSubProtocol=opts.protocolId==="MQIsdp"&&opts.protocolVersion===3?"mqttv3.1":"mqtt";setDefaultOpts(opts);var url=buildUrl(opts,client);return websocket(url,[websocketSubProtocol],opts.wsOptions)}function buildBuilder(client,opts){return createWebSocket(client,opts)}function buildBuilderBrowser(client,opts){if(!opts.hostname){opts.hostname=opts.host;}if(!opts.hostname){if(typeof document==="undefined"){throw new Error("Could not determine host. Specify host manually.")}var parsed=urlModule.parse(document.URL);opts.hostname=parsed.hostname;if(!opts.port){opts.port=parsed.port;}}return createWebSocket(client,opts)}if(IS_BROWSER){module.exports=buildBuilderBrowser;}else{module.exports=buildBuilder;}}).call(this,require("_process"));},{_process:31,url:49,"websocket-stream":55}],5:[function(require,module,exports){(function(process){"use strict";var Readable=require("readable-stream").Readable;var streamsOpts={objectMode:true};function Store(){if(!(this instanceof Store)){return new Store}this._inflights={};}Store.prototype.put=function(packet,cb){this._inflights[packet.messageId]=packet;if(cb){cb();}return this};Store.prototype.createStream=function(){var stream=new Readable(streamsOpts);var inflights=this._inflights;var ids=Object.keys(this._inflights);var destroyed=false;var i=0;stream._read=function(){if(!destroyed&&i<ids.length){this.push(inflights[ids[i++]]);}else{this.push(null);}};stream.destroy=function(){if(destroyed){return}var self=this;destroyed=true;process.nextTick(function(){self.emit("close");});};return stream};Store.prototype.del=function(packet,cb){packet=this._inflights[packet.messageId];if(packet){delete this._inflights[packet.messageId];cb(null,packet);}else if(cb){cb(new Error("missing packet"));}return this};Store.prototype.get=function(packet,cb){packet=this._inflights[packet.messageId];if(packet){cb(null,packet);}else if(cb){cb(new Error("missing packet"));}return this};Store.prototype.close=function(cb){this._inflights=null;if(cb){cb();}};module.exports=Store;}).call(this,require("_process"));},{_process:31,"readable-stream":43}],6:[function(require,module,exports){"use strict";function validateTopic(topic){var parts=topic.split("/");for(var i=0;i<parts.length;i++){if(parts[i]==="+"){continue}if(parts[i]==="#"){return i===parts.length-1}if(parts[i].indexOf("+")!==-1||parts[i].indexOf("#")!==-1){return false}}return true}function validateTopics(topics){if(topics.length===0){return"empty_topic_list"}for(var i=0;i<topics.length;i++){if(!validateTopic(topics[i])){return topics[i]}}return null}module.exports={validateTopics:validateTopics};},{}],7:[function(require,module,exports){(function(process){"use strict";var MqttClient=require("../client");var url=require("url");var xtend=require("xtend");var protocols={};if(process.title!=="browser"){protocols.mqtt=require("./tcp");protocols.tcp=require("./tcp");protocols.ssl=require("./tls");protocols.tls=require("./tls");protocols.mqtts=require("./tls");}protocols.ws=require("./ws");protocols.wss=require("./ws");function parseAuthOptions(opts){var matches;if(opts.auth){matches=opts.auth.match(/^(.+):(.+)$/);if(matches){opts.username=matches[1];opts.password=matches[2];}else{opts.username=opts.auth;}}}function connect(brokerUrl,opts){if(typeof brokerUrl==="object"&&!opts){opts=brokerUrl;brokerUrl=null;}opts=opts||{};if(brokerUrl){opts=xtend(url.parse(brokerUrl,true),opts);if(opts.protocol===null){throw new Error("Missing protocol")}opts.protocol=opts.protocol.replace(/:$/,"");}parseAuthOptions(opts);if(opts.query&&typeof opts.query.clientId==="string"){opts.clientId=opts.query.clientId;}if(opts.cert&&opts.key){if(opts.protocol){if(["mqtts","wss"].indexOf(opts.protocol)===-1){switch(opts.protocol){case"mqtt":opts.protocol="mqtts";break;case"ws":opts.protocol="wss";break;default:throw new Error('Unknown protocol for secure connection: "'+opts.protocol+'"!');break}}}else{throw new Error("Missing secure protocol key")}}if(!protocols[opts.protocol]){var isSecure=["mqtts","wss"].indexOf(opts.protocol)!==-1;opts.protocol=["mqtt","mqtts","ws","wss"].filter(function(key,index){if(isSecure&&index%2===0){return false}return typeof protocols[key]==="function"})[0];}if(opts.clean===false&&!opts.clientId){throw new Error("Missing clientId for unclean clients")}function wrapper(client){if(opts.servers){if(!client._reconnectCount||client._reconnectCount===opts.servers.length){client._reconnectCount=0;}opts.host=opts.servers[client._reconnectCount].host;opts.port=opts.servers[client._reconnectCount].port;opts.hostname=opts.host;client._reconnectCount++;}return protocols[opts.protocol](client,opts)}return new MqttClient(wrapper,opts)}module.exports=connect;module.exports.connect=connect;module.exports.MqttClient=MqttClient;}).call(this,require("_process"));},{"../client":1,"./tcp":2,"./tls":3,"./ws":4,_process:31,url:49,xtend:58}],8:[function(require,module,exports){"use strict";exports.byteLength=byteLength;exports.toByteArray=toByteArray;exports.fromByteArray=fromByteArray;var lookup=[];var revLookup=[];var Arr=typeof Uint8Array!=="undefined"?Uint8Array:Array;var code="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";for(var i=0,len=code.length;i<len;++i){lookup[i]=code[i];revLookup[code.charCodeAt(i)]=i;}revLookup["-".charCodeAt(0)]=62;revLookup["_".charCodeAt(0)]=63;function placeHoldersCount(b64){var len=b64.length;if(len%4>0){throw new Error("Invalid string. Length must be a multiple of 4")}return b64[len-2]==="="?2:b64[len-1]==="="?1:0}function byteLength(b64){return b64.length*3/4-placeHoldersCount(b64)}function toByteArray(b64){var i,j,l,tmp,placeHolders,arr;var len=b64.length;placeHolders=placeHoldersCount(b64);arr=new Arr(len*3/4-placeHolders);l=placeHolders>0?len-4:len;var L=0;for(i=0,j=0;i<l;i+=4,j+=3){tmp=revLookup[b64.charCodeAt(i)]<<18|revLookup[b64.charCodeAt(i+1)]<<12|revLookup[b64.charCodeAt(i+2)]<<6|revLookup[b64.charCodeAt(i+3)];arr[L++]=tmp>>16&255;arr[L++]=tmp>>8&255;arr[L++]=tmp&255;}if(placeHolders===2){tmp=revLookup[b64.charCodeAt(i)]<<2|revLookup[b64.charCodeAt(i+1)]>>4;arr[L++]=tmp&255;}else if(placeHolders===1){tmp=revLookup[b64.charCodeAt(i)]<<10|revLookup[b64.charCodeAt(i+1)]<<4|revLookup[b64.charCodeAt(i+2)]>>2;arr[L++]=tmp>>8&255;arr[L++]=tmp&255;}return arr}function tripletToBase64(num){return lookup[num>>18&63]+lookup[num>>12&63]+lookup[num>>6&63]+lookup[num&63]}function encodeChunk(uint8,start,end){var tmp;var output=[];for(var i=start;i<end;i+=3){tmp=(uint8[i]<<16)+(uint8[i+1]<<8)+uint8[i+2];output.push(tripletToBase64(tmp));}return output.join("")}function fromByteArray(uint8){var tmp;var len=uint8.length;var extraBytes=len%3;var output="";var parts=[];var maxChunkLength=16383;for(var i=0,len2=len-extraBytes;i<len2;i+=maxChunkLength){parts.push(encodeChunk(uint8,i,i+maxChunkLength>len2?len2:i+maxChunkLength));}if(extraBytes===1){tmp=uint8[len-1];output+=lookup[tmp>>2];output+=lookup[tmp<<4&63];output+="==";}else if(extraBytes===2){tmp=(uint8[len-2]<<8)+uint8[len-1];output+=lookup[tmp>>10];output+=lookup[tmp>>4&63];output+=lookup[tmp<<2&63];output+="=";}parts.push(output);return parts.join("")}},{}],9:[function(require,module,exports){(function(Buffer){var DuplexStream=require("readable-stream/duplex"),util=require("util");function BufferList(callback){if(!(this instanceof BufferList))return new BufferList(callback);this._bufs=[];this.length=0;if(typeof callback=="function"){this._callback=callback;var piper=function piper(err){if(this._callback){this._callback(err);this._callback=null;}}.bind(this);this.on("pipe",function onPipe(src){src.on("error",piper);});this.on("unpipe",function onUnpipe(src){src.removeListener("error",piper);});}else{this.append(callback);}DuplexStream.call(this);}util.inherits(BufferList,DuplexStream);BufferList.prototype._offset=function _offset(offset){var tot=0,i=0,_t;if(offset===0)return[0,0];for(;i<this._bufs.length;i++){_t=tot+this._bufs[i].length;if(offset<_t||i==this._bufs.length-1)return[i,offset-tot];tot=_t;}};BufferList.prototype.append=function append(buf){var i=0;if(Buffer.isBuffer(buf)){this._appendBuffer(buf);}else if(Array.isArray(buf)){for(;i<buf.length;i++)this.append(buf[i]);}else if(buf instanceof BufferList){for(;i<buf._bufs.length;i++)this.append(buf._bufs[i]);}else if(buf!=null){if(typeof buf=="number")buf=buf.toString();this._appendBuffer(new Buffer(buf));}return this};BufferList.prototype._appendBuffer=function appendBuffer(buf){this._bufs.push(buf);this.length+=buf.length;};BufferList.prototype._write=function _write(buf,encoding,callback){this._appendBuffer(buf);if(typeof callback=="function")callback();};BufferList.prototype._read=function _read(size){if(!this.length)return this.push(null);size=Math.min(size,this.length);this.push(this.slice(0,size));this.consume(size);};BufferList.prototype.end=function end(chunk){DuplexStream.prototype.end.call(this,chunk);if(this._callback){this._callback(null,this.slice());this._callback=null;}};BufferList.prototype.get=function get(index){return this.slice(index,index+1)[0]};BufferList.prototype.slice=function slice(start,end){if(typeof start=="number"&&start<0)start+=this.length;if(typeof end=="number"&&end<0)end+=this.length;return this.copy(null,0,start,end)};BufferList.prototype.copy=function copy(dst,dstStart,srcStart,srcEnd){if(typeof srcStart!="number"||srcStart<0)srcStart=0;if(typeof srcEnd!="number"||srcEnd>this.length)srcEnd=this.length;if(srcStart>=this.length)return dst||new Buffer(0);if(srcEnd<=0)return dst||new Buffer(0);var copy=!!dst,off=this._offset(srcStart),len=srcEnd-srcStart,bytes=len,bufoff=copy&&dstStart||0,start=off[1],l,i;if(srcStart===0&&srcEnd==this.length){if(!copy){return this._bufs.length===1?this._bufs[0]:Buffer.concat(this._bufs,this.length)}for(i=0;i<this._bufs.length;i++){this._bufs[i].copy(dst,bufoff);bufoff+=this._bufs[i].length;}return dst}if(bytes<=this._bufs[off[0]].length-start){return copy?this._bufs[off[0]].copy(dst,dstStart,start,start+bytes):this._bufs[off[0]].slice(start,start+bytes)}if(!copy)dst=new Buffer(len);for(i=off[0];i<this._bufs.length;i++){l=this._bufs[i].length-start;if(bytes>l){this._bufs[i].copy(dst,bufoff,start);}else{this._bufs[i].copy(dst,bufoff,start,start+bytes);break}bufoff+=l;bytes-=l;if(start)start=0;}return dst};BufferList.prototype.shallowSlice=function shallowSlice(start,end){start=start||0;end=end||this.length;if(start<0)start+=this.length;if(end<0)end+=this.length;var startOffset=this._offset(start),endOffset=this._offset(end),buffers=this._bufs.slice(startOffset[0],endOffset[0]+1);if(startOffset[1]!=0)buffers[0]=buffers[0].slice(startOffset[1]);if(endOffset[1]==0)buffers.pop();else buffers[buffers.length-1]=buffers[buffers.length-1].slice(0,endOffset[1]);return new BufferList(buffers)};BufferList.prototype.toString=function toString(encoding,start,end){return this.slice(start,end).toString(encoding)};BufferList.prototype.consume=function consume(bytes){while(this._bufs.length){if(bytes>=this._bufs[0].length){bytes-=this._bufs[0].length;this.length-=this._bufs[0].length;this._bufs.shift();}else{this._bufs[0]=this._bufs[0].slice(bytes);this.length-=bytes;break}}return this};BufferList.prototype.duplicate=function duplicate(){var i=0,copy=new BufferList;for(;i<this._bufs.length;i++)copy.append(this._bufs[i]);return copy};BufferList.prototype.destroy=function destroy(){this._bufs.length=0;this.length=0;this.push(null);};(function(){var methods={readDoubleBE:8,readDoubleLE:8,readFloatBE:4,readFloatLE:4,readInt32BE:4,readInt32LE:4,readUInt32BE:4,readUInt32LE:4,readInt16BE:2,readInt16LE:2,readUInt16BE:2,readUInt16LE:2,readInt8:1,readUInt8:1};for(var m in methods){(function(m){BufferList.prototype[m]=function(offset){return this.slice(offset,offset+methods[m])[m](0)};})(m);}})();module.exports=BufferList;}).call(this,require("buffer").Buffer);},{buffer:11,"readable-stream/duplex":36,util:54}],10:[function(require,module,exports){},{}],11:[function(require,module,exports){"use strict";var base64=require("base64-js");var ieee754=require("ieee754");exports.Buffer=Buffer;exports.SlowBuffer=SlowBuffer;exports.INSPECT_MAX_BYTES=50;var K_MAX_LENGTH=2147483647;exports.kMaxLength=K_MAX_LENGTH;Buffer.TYPED_ARRAY_SUPPORT=typedArraySupport();if(!Buffer.TYPED_ARRAY_SUPPORT&&typeof console!=="undefined"&&typeof console.error==="function"){console.error("This browser lacks typed array (Uint8Array) support which is required by "+"`buffer` v5.x. Use `buffer` v4.x if you require old browser support.");}function typedArraySupport(){try{var arr=new Uint8Array(1);arr.__proto__={__proto__:Uint8Array.prototype,foo:function(){return 42}};return arr.foo()===42}catch(e){return false}}function createBuffer(length){if(length>K_MAX_LENGTH){throw new RangeError("Invalid typed array length")}var buf=new Uint8Array(length);buf.__proto__=Buffer.prototype;return buf}function Buffer(arg,encodingOrOffset,length){if(typeof arg==="number"){if(typeof encodingOrOffset==="string"){throw new Error("If encoding is specified then the first argument must be a string")}return allocUnsafe(arg)}return from(arg,encodingOrOffset,length)}if(typeof Symbol!=="undefined"&&Symbol.species&&Buffer[Symbol.species]===Buffer){Object.defineProperty(Buffer,Symbol.species,{value:null,configurable:true,enumerable:false,writable:false});}Buffer.poolSize=8192;function from(value,encodingOrOffset,length){if(typeof value==="number"){throw new TypeError('"value" argument must not be a number')}if(value instanceof ArrayBuffer){return fromArrayBuffer(value,encodingOrOffset,length)}if(typeof value==="string"){return fromString(value,encodingOrOffset)}return fromObject(value)}Buffer.from=function(value,encodingOrOffset,length){return from(value,encodingOrOffset,length)};Buffer.prototype.__proto__=Uint8Array.prototype;Buffer.__proto__=Uint8Array;function assertSize(size){if(typeof size!=="number"){throw new TypeError('"size" argument must be a number')}else if(size<0){throw new RangeError('"size" argument must not be negative')}}function alloc(size,fill,encoding){assertSize(size);if(size<=0){return createBuffer(size)}if(fill!==undefined){return typeof encoding==="string"?createBuffer(size).fill(fill,encoding):createBuffer(size).fill(fill)}return createBuffer(size)}Buffer.alloc=function(size,fill,encoding){return alloc(size,fill,encoding)};function allocUnsafe(size){assertSize(size);return createBuffer(size<0?0:checked(size)|0)}Buffer.allocUnsafe=function(size){return allocUnsafe(size)};Buffer.allocUnsafeSlow=function(size){return allocUnsafe(size)};function fromString(string,encoding){if(typeof encoding!=="string"||encoding===""){encoding="utf8";}if(!Buffer.isEncoding(encoding)){throw new TypeError('"encoding" must be a valid string encoding')}var length=byteLength(string,encoding)|0;var buf=createBuffer(length);var actual=buf.write(string,encoding);if(actual!==length){buf=buf.slice(0,actual);}return buf}function fromArrayLike(array){var length=array.length<0?0:checked(array.length)|0;var buf=createBuffer(length);for(var i=0;i<length;i+=1){buf[i]=array[i]&255;}return buf}function fromArrayBuffer(array,byteOffset,length){if(byteOffset<0||array.byteLength<byteOffset){throw new RangeError("'offset' is out of bounds")}if(array.byteLength<byteOffset+(length||0)){throw new RangeError("'length' is out of bounds")}var buf;if(byteOffset===undefined&&length===undefined){buf=new Uint8Array(array);}else if(length===undefined){buf=new Uint8Array(array,byteOffset);}else{buf=new Uint8Array(array,byteOffset,length);}buf.__proto__=Buffer.prototype;return buf}function fromObject(obj){if(Buffer.isBuffer(obj)){var len=checked(obj.length)|0;var buf=createBuffer(len);if(buf.length===0){return buf}obj.copy(buf,0,0,len);return buf}if(obj){if(ArrayBuffer.isView(obj)||"length"in obj){if(typeof obj.length!=="number"||isnan(obj.length)){return createBuffer(0)}return fromArrayLike(obj)}if(obj.type==="Buffer"&&Array.isArray(obj.data)){return fromArrayLike(obj.data)}}throw new TypeError("First argument must be a string, Buffer, ArrayBuffer, Array, or array-like object.")}function checked(length){if(length>=K_MAX_LENGTH){throw new RangeError("Attempt to allocate Buffer larger than maximum "+"size: 0x"+K_MAX_LENGTH.toString(16)+" bytes")}return length|0}function SlowBuffer(length){if(+length!=length){length=0;}return Buffer.alloc(+length)}Buffer.isBuffer=function isBuffer(b){return b!=null&&b._isBuffer===true};Buffer.compare=function compare(a,b){if(!Buffer.isBuffer(a)||!Buffer.isBuffer(b)){throw new TypeError("Arguments must be Buffers")}if(a===b)return 0;var x=a.length;var y=b.length;for(var i=0,len=Math.min(x,y);i<len;++i){if(a[i]!==b[i]){x=a[i];y=b[i];break}}if(x<y)return-1;if(y<x)return 1;return 0};Buffer.isEncoding=function isEncoding(encoding){switch(String(encoding).toLowerCase()){case"hex":case"utf8":case"utf-8":case"ascii":case"latin1":case"binary":case"base64":case"ucs2":case"ucs-2":case"utf16le":case"utf-16le":return true;default:return false}};Buffer.concat=function concat(list,length){if(!Array.isArray(list)){throw new TypeError('"list" argument must be an Array of Buffers')}if(list.length===0){return Buffer.alloc(0)}var i;if(length===undefined){length=0;for(i=0;i<list.length;++i){length+=list[i].length;}}var buffer=Buffer.allocUnsafe(length);var pos=0;for(i=0;i<list.length;++i){var buf=list[i];if(!Buffer.isBuffer(buf)){throw new TypeError('"list" argument must be an Array of Buffers')}buf.copy(buffer,pos);pos+=buf.length;}return buffer};function byteLength(string,encoding){if(Buffer.isBuffer(string)){return string.length}if(ArrayBuffer.isView(string)||string instanceof ArrayBuffer){return string.byteLength}if(typeof string!=="string"){string=""+string;}var len=string.length;
if(len===0)return 0;var loweredCase=false;for(;;){switch(encoding){case"ascii":case"latin1":case"binary":return len;case"utf8":case"utf-8":case undefined:return utf8ToBytes(string).length;case"ucs2":case"ucs-2":case"utf16le":case"utf-16le":return len*2;case"hex":return len>>>1;case"base64":return base64ToBytes(string).length;default:if(loweredCase)return utf8ToBytes(string).length;encoding=(""+encoding).toLowerCase();loweredCase=true;}}}Buffer.byteLength=byteLength;function slowToString(encoding,start,end){var loweredCase=false;if(start===undefined||start<0){start=0;}if(start>this.length){return""}if(end===undefined||end>this.length){end=this.length;}if(end<=0){return""}end>>>=0;start>>>=0;if(end<=start){return""}if(!encoding)encoding="utf8";while(true){switch(encoding){case"hex":return hexSlice(this,start,end);case"utf8":case"utf-8":return utf8Slice(this,start,end);case"ascii":return asciiSlice(this,start,end);case"latin1":case"binary":return latin1Slice(this,start,end);case"base64":return base64Slice(this,start,end);case"ucs2":case"ucs-2":case"utf16le":case"utf-16le":return utf16leSlice(this,start,end);default:if(loweredCase)throw new TypeError("Unknown encoding: "+encoding);encoding=(encoding+"").toLowerCase();loweredCase=true;}}}Buffer.prototype._isBuffer=true;function swap(b,n,m){var i=b[n];b[n]=b[m];b[m]=i;}Buffer.prototype.swap16=function swap16(){var len=this.length;if(len%2!==0){throw new RangeError("Buffer size must be a multiple of 16-bits")}for(var i=0;i<len;i+=2){swap(this,i,i+1);}return this};Buffer.prototype.swap32=function swap32(){var len=this.length;if(len%4!==0){throw new RangeError("Buffer size must be a multiple of 32-bits")}for(var i=0;i<len;i+=4){swap(this,i,i+3);swap(this,i+1,i+2);}return this};Buffer.prototype.swap64=function swap64(){var len=this.length;if(len%8!==0){throw new RangeError("Buffer size must be a multiple of 64-bits")}for(var i=0;i<len;i+=8){swap(this,i,i+7);swap(this,i+1,i+6);swap(this,i+2,i+5);swap(this,i+3,i+4);}return this};Buffer.prototype.toString=function toString(){var length=this.length;if(length===0)return"";if(arguments.length===0)return utf8Slice(this,0,length);return slowToString.apply(this,arguments)};Buffer.prototype.equals=function equals(b){if(!Buffer.isBuffer(b))throw new TypeError("Argument must be a Buffer");if(this===b)return true;return Buffer.compare(this,b)===0};Buffer.prototype.inspect=function inspect(){var str="";var max=exports.INSPECT_MAX_BYTES;if(this.length>0){str=this.toString("hex",0,max).match(/.{2}/g).join(" ");if(this.length>max)str+=" ... ";}return"<Buffer "+str+">"};Buffer.prototype.compare=function compare(target,start,end,thisStart,thisEnd){if(!Buffer.isBuffer(target)){throw new TypeError("Argument must be a Buffer")}if(start===undefined){start=0;}if(end===undefined){end=target?target.length:0;}if(thisStart===undefined){thisStart=0;}if(thisEnd===undefined){thisEnd=this.length;}if(start<0||end>target.length||thisStart<0||thisEnd>this.length){throw new RangeError("out of range index")}if(thisStart>=thisEnd&&start>=end){return 0}if(thisStart>=thisEnd){return-1}if(start>=end){return 1}start>>>=0;end>>>=0;thisStart>>>=0;thisEnd>>>=0;if(this===target)return 0;var x=thisEnd-thisStart;var y=end-start;var len=Math.min(x,y);var thisCopy=this.slice(thisStart,thisEnd);var targetCopy=target.slice(start,end);for(var i=0;i<len;++i){if(thisCopy[i]!==targetCopy[i]){x=thisCopy[i];y=targetCopy[i];break}}if(x<y)return-1;if(y<x)return 1;return 0};function bidirectionalIndexOf(buffer,val,byteOffset,encoding,dir){if(buffer.length===0)return-1;if(typeof byteOffset==="string"){encoding=byteOffset;byteOffset=0;}else if(byteOffset>2147483647){byteOffset=2147483647;}else if(byteOffset<-2147483648){byteOffset=-2147483648;}byteOffset=+byteOffset;if(isNaN(byteOffset)){byteOffset=dir?0:buffer.length-1;}if(byteOffset<0)byteOffset=buffer.length+byteOffset;if(byteOffset>=buffer.length){if(dir)return-1;else byteOffset=buffer.length-1;}else if(byteOffset<0){if(dir)byteOffset=0;else return-1}if(typeof val==="string"){val=Buffer.from(val,encoding);}if(Buffer.isBuffer(val)){if(val.length===0){return-1}return arrayIndexOf(buffer,val,byteOffset,encoding,dir)}else if(typeof val==="number"){val=val&255;if(typeof Uint8Array.prototype.indexOf==="function"){if(dir){return Uint8Array.prototype.indexOf.call(buffer,val,byteOffset)}else{return Uint8Array.prototype.lastIndexOf.call(buffer,val,byteOffset)}}return arrayIndexOf(buffer,[val],byteOffset,encoding,dir)}throw new TypeError("val must be string, number or Buffer")}function arrayIndexOf(arr,val,byteOffset,encoding,dir){var indexSize=1;var arrLength=arr.length;var valLength=val.length;if(encoding!==undefined){encoding=String(encoding).toLowerCase();if(encoding==="ucs2"||encoding==="ucs-2"||encoding==="utf16le"||encoding==="utf-16le"){if(arr.length<2||val.length<2){return-1}indexSize=2;arrLength/=2;valLength/=2;byteOffset/=2;}}function read(buf,i){if(indexSize===1){return buf[i]}else{return buf.readUInt16BE(i*indexSize)}}var i;if(dir){var foundIndex=-1;for(i=byteOffset;i<arrLength;i++){if(read(arr,i)===read(val,foundIndex===-1?0:i-foundIndex)){if(foundIndex===-1)foundIndex=i;if(i-foundIndex+1===valLength)return foundIndex*indexSize}else{if(foundIndex!==-1)i-=i-foundIndex;foundIndex=-1;}}}else{if(byteOffset+valLength>arrLength)byteOffset=arrLength-valLength;for(i=byteOffset;i>=0;i--){var found=true;for(var j=0;j<valLength;j++){if(read(arr,i+j)!==read(val,j)){found=false;break}}if(found)return i}}return-1}Buffer.prototype.includes=function includes(val,byteOffset,encoding){return this.indexOf(val,byteOffset,encoding)!==-1};Buffer.prototype.indexOf=function indexOf(val,byteOffset,encoding){return bidirectionalIndexOf(this,val,byteOffset,encoding,true)};Buffer.prototype.lastIndexOf=function lastIndexOf(val,byteOffset,encoding){return bidirectionalIndexOf(this,val,byteOffset,encoding,false)};function hexWrite(buf,string,offset,length){offset=Number(offset)||0;var remaining=buf.length-offset;if(!length){length=remaining;}else{length=Number(length);if(length>remaining){length=remaining;}}var strLen=string.length;if(strLen%2!==0)throw new TypeError("Invalid hex string");if(length>strLen/2){length=strLen/2;}for(var i=0;i<length;++i){var parsed=parseInt(string.substr(i*2,2),16);if(isNaN(parsed))return i;buf[offset+i]=parsed;}return i}function utf8Write(buf,string,offset,length){return blitBuffer(utf8ToBytes(string,buf.length-offset),buf,offset,length)}function asciiWrite(buf,string,offset,length){return blitBuffer(asciiToBytes(string),buf,offset,length)}function latin1Write(buf,string,offset,length){return asciiWrite(buf,string,offset,length)}function base64Write(buf,string,offset,length){return blitBuffer(base64ToBytes(string),buf,offset,length)}function ucs2Write(buf,string,offset,length){return blitBuffer(utf16leToBytes(string,buf.length-offset),buf,offset,length)}Buffer.prototype.write=function write(string,offset,length,encoding){if(offset===undefined){encoding="utf8";length=this.length;offset=0;}else if(length===undefined&&typeof offset==="string"){encoding=offset;length=this.length;offset=0;}else if(isFinite(offset)){offset=offset>>>0;if(isFinite(length)){length=length>>>0;if(encoding===undefined)encoding="utf8";}else{encoding=length;length=undefined;}}else{throw new Error("Buffer.write(string, encoding, offset[, length]) is no longer supported")}var remaining=this.length-offset;if(length===undefined||length>remaining)length=remaining;if(string.length>0&&(length<0||offset<0)||offset>this.length){throw new RangeError("Attempt to write outside buffer bounds")}if(!encoding)encoding="utf8";var loweredCase=false;for(;;){switch(encoding){case"hex":return hexWrite(this,string,offset,length);case"utf8":case"utf-8":return utf8Write(this,string,offset,length);case"ascii":return asciiWrite(this,string,offset,length);case"latin1":case"binary":return latin1Write(this,string,offset,length);case"base64":return base64Write(this,string,offset,length);case"ucs2":case"ucs-2":case"utf16le":case"utf-16le":return ucs2Write(this,string,offset,length);default:if(loweredCase)throw new TypeError("Unknown encoding: "+encoding);encoding=(""+encoding).toLowerCase();loweredCase=true;}}};Buffer.prototype.toJSON=function toJSON(){return{type:"Buffer",data:Array.prototype.slice.call(this._arr||this,0)}};function base64Slice(buf,start,end){if(start===0&&end===buf.length){return base64.fromByteArray(buf)}else{return base64.fromByteArray(buf.slice(start,end))}}function utf8Slice(buf,start,end){end=Math.min(buf.length,end);var res=[];var i=start;while(i<end){var firstByte=buf[i];var codePoint=null;var bytesPerSequence=firstByte>239?4:firstByte>223?3:firstByte>191?2:1;if(i+bytesPerSequence<=end){var secondByte,thirdByte,fourthByte,tempCodePoint;switch(bytesPerSequence){case 1:if(firstByte<128){codePoint=firstByte;}break;case 2:secondByte=buf[i+1];if((secondByte&192)===128){tempCodePoint=(firstByte&31)<<6|secondByte&63;if(tempCodePoint>127){codePoint=tempCodePoint;}}break;case 3:secondByte=buf[i+1];thirdByte=buf[i+2];if((secondByte&192)===128&&(thirdByte&192)===128){tempCodePoint=(firstByte&15)<<12|(secondByte&63)<<6|thirdByte&63;if(tempCodePoint>2047&&(tempCodePoint<55296||tempCodePoint>57343)){codePoint=tempCodePoint;}}break;case 4:secondByte=buf[i+1];thirdByte=buf[i+2];fourthByte=buf[i+3];if((secondByte&192)===128&&(thirdByte&192)===128&&(fourthByte&192)===128){tempCodePoint=(firstByte&15)<<18|(secondByte&63)<<12|(thirdByte&63)<<6|fourthByte&63;if(tempCodePoint>65535&&tempCodePoint<1114112){codePoint=tempCodePoint;}}}}if(codePoint===null){codePoint=65533;bytesPerSequence=1;}else if(codePoint>65535){codePoint-=65536;res.push(codePoint>>>10&1023|55296);codePoint=56320|codePoint&1023;}res.push(codePoint);i+=bytesPerSequence;}return decodeCodePointsArray(res)}var MAX_ARGUMENTS_LENGTH=4096;function decodeCodePointsArray(codePoints){var len=codePoints.length;if(len<=MAX_ARGUMENTS_LENGTH){return String.fromCharCode.apply(String,codePoints)}var res="";var i=0;while(i<len){res+=String.fromCharCode.apply(String,codePoints.slice(i,i+=MAX_ARGUMENTS_LENGTH));}return res}function asciiSlice(buf,start,end){var ret="";end=Math.min(buf.length,end);for(var i=start;i<end;++i){ret+=String.fromCharCode(buf[i]&127);}return ret}function latin1Slice(buf,start,end){var ret="";end=Math.min(buf.length,end);for(var i=start;i<end;++i){ret+=String.fromCharCode(buf[i]);}return ret}function hexSlice(buf,start,end){var len=buf.length;if(!start||start<0)start=0;if(!end||end<0||end>len)end=len;var out="";for(var i=start;i<end;++i){out+=toHex(buf[i]);}return out}function utf16leSlice(buf,start,end){var bytes=buf.slice(start,end);var res="";for(var i=0;i<bytes.length;i+=2){res+=String.fromCharCode(bytes[i]+bytes[i+1]*256);}return res}Buffer.prototype.slice=function slice(start,end){var len=this.length;start=~~start;end=end===undefined?len:~~end;if(start<0){start+=len;if(start<0)start=0;}else if(start>len){start=len;}if(end<0){end+=len;if(end<0)end=0;}else if(end>len){end=len;}if(end<start)end=start;var newBuf=this.subarray(start,end);newBuf.__proto__=Buffer.prototype;return newBuf};function checkOffset(offset,ext,length){if(offset%1!==0||offset<0)throw new RangeError("offset is not uint");if(offset+ext>length)throw new RangeError("Trying to access beyond buffer length")}Buffer.prototype.readUIntLE=function readUIntLE(offset,byteLength,noAssert){offset=offset>>>0;byteLength=byteLength>>>0;if(!noAssert)checkOffset(offset,byteLength,this.length);var val=this[offset];var mul=1;var i=0;while(++i<byteLength&&(mul*=256)){val+=this[offset+i]*mul;}return val};Buffer.prototype.readUIntBE=function readUIntBE(offset,byteLength,noAssert){offset=offset>>>0;byteLength=byteLength>>>0;if(!noAssert){checkOffset(offset,byteLength,this.length);}var val=this[offset+--byteLength];var mul=1;while(byteLength>0&&(mul*=256)){val+=this[offset+--byteLength]*mul;}return val};Buffer.prototype.readUInt8=function readUInt8(offset,noAssert){offset=offset>>>0;if(!noAssert)checkOffset(offset,1,this.length);return this[offset]};Buffer.prototype.readUInt16LE=function readUInt16LE(offset,noAssert){offset=offset>>>0;if(!noAssert)checkOffset(offset,2,this.length);return this[offset]|this[offset+1]<<8};Buffer.prototype.readUInt16BE=function readUInt16BE(offset,noAssert){offset=offset>>>0;if(!noAssert)checkOffset(offset,2,this.length);return this[offset]<<8|this[offset+1]};Buffer.prototype.readUInt32LE=function readUInt32LE(offset,noAssert){offset=offset>>>0;if(!noAssert)checkOffset(offset,4,this.length);return(this[offset]|this[offset+1]<<8|this[offset+2]<<16)+this[offset+3]*16777216};Buffer.prototype.readUInt32BE=function readUInt32BE(offset,noAssert){offset=offset>>>0;if(!noAssert)checkOffset(offset,4,this.length);return this[offset]*16777216+(this[offset+1]<<16|this[offset+2]<<8|this[offset+3])};Buffer.prototype.readIntLE=function readIntLE(offset,byteLength,noAssert){offset=offset>>>0;byteLength=byteLength>>>0;if(!noAssert)checkOffset(offset,byteLength,this.length);var val=this[offset];var mul=1;var i=0;while(++i<byteLength&&(mul*=256)){val+=this[offset+i]*mul;}mul*=128;if(val>=mul)val-=Math.pow(2,8*byteLength);return val};Buffer.prototype.readIntBE=function readIntBE(offset,byteLength,noAssert){offset=offset>>>0;byteLength=byteLength>>>0;if(!noAssert)checkOffset(offset,byteLength,this.length);var i=byteLength;var mul=1;var val=this[offset+--i];while(i>0&&(mul*=256)){val+=this[offset+--i]*mul;}mul*=128;if(val>=mul)val-=Math.pow(2,8*byteLength);return val};Buffer.prototype.readInt8=function readInt8(offset,noAssert){offset=offset>>>0;if(!noAssert)checkOffset(offset,1,this.length);if(!(this[offset]&128))return this[offset];return(255-this[offset]+1)*-1};Buffer.prototype.readInt16LE=function readInt16LE(offset,noAssert){offset=offset>>>0;if(!noAssert)checkOffset(offset,2,this.length);var val=this[offset]|this[offset+1]<<8;return val&32768?val|4294901760:val};Buffer.prototype.readInt16BE=function readInt16BE(offset,noAssert){offset=offset>>>0;if(!noAssert)checkOffset(offset,2,this.length);var val=this[offset+1]|this[offset]<<8;return val&32768?val|4294901760:val};Buffer.prototype.readInt32LE=function readInt32LE(offset,noAssert){offset=offset>>>0;if(!noAssert)checkOffset(offset,4,this.length);return this[offset]|this[offset+1]<<8|this[offset+2]<<16|this[offset+3]<<24};Buffer.prototype.readInt32BE=function readInt32BE(offset,noAssert){offset=offset>>>0;if(!noAssert)checkOffset(offset,4,this.length);return this[offset]<<24|this[offset+1]<<16|this[offset+2]<<8|this[offset+3]};Buffer.prototype.readFloatLE=function readFloatLE(offset,noAssert){offset=offset>>>0;if(!noAssert)checkOffset(offset,4,this.length);return ieee754.read(this,offset,true,23,4)};Buffer.prototype.readFloatBE=function readFloatBE(offset,noAssert){offset=offset>>>0;if(!noAssert)checkOffset(offset,4,this.length);return ieee754.read(this,offset,false,23,4)};Buffer.prototype.readDoubleLE=function readDoubleLE(offset,noAssert){offset=offset>>>0;if(!noAssert)checkOffset(offset,8,this.length);return ieee754.read(this,offset,true,52,8)};Buffer.prototype.readDoubleBE=function readDoubleBE(offset,noAssert){offset=offset>>>0;if(!noAssert)checkOffset(offset,8,this.length);return ieee754.read(this,offset,false,52,8)};function checkInt(buf,value,offset,ext,max,min){if(!Buffer.isBuffer(buf))throw new TypeError('"buffer" argument must be a Buffer instance');if(value>max||value<min)throw new RangeError('"value" argument is out of bounds');if(offset+ext>buf.length)throw new RangeError("Index out of range")}Buffer.prototype.writeUIntLE=function writeUIntLE(value,offset,byteLength,noAssert){value=+value;offset=offset>>>0;byteLength=byteLength>>>0;if(!noAssert){var maxBytes=Math.pow(2,8*byteLength)-1;checkInt(this,value,offset,byteLength,maxBytes,0);}var mul=1;var i=0;this[offset]=value&255;while(++i<byteLength&&(mul*=256)){this[offset+i]=value/mul&255;}return offset+byteLength};Buffer.prototype.writeUIntBE=function writeUIntBE(value,offset,byteLength,noAssert){value=+value;offset=offset>>>0;byteLength=byteLength>>>0;if(!noAssert){var maxBytes=Math.pow(2,8*byteLength)-1;checkInt(this,value,offset,byteLength,maxBytes,0);}var i=byteLength-1;var mul=1;this[offset+i]=value&255;while(--i>=0&&(mul*=256)){this[offset+i]=value/mul&255;}return offset+byteLength};Buffer.prototype.writeUInt8=function writeUInt8(value,offset,noAssert){value=+value;offset=offset>>>0;if(!noAssert)checkInt(this,value,offset,1,255,0);this[offset]=value&255;return offset+1};Buffer.prototype.writeUInt16LE=function writeUInt16LE(value,offset,noAssert){value=+value;offset=offset>>>0;if(!noAssert)checkInt(this,value,offset,2,65535,0);this[offset]=value&255;this[offset+1]=value>>>8;return offset+2};Buffer.prototype.writeUInt16BE=function writeUInt16BE(value,offset,noAssert){value=+value;offset=offset>>>0;if(!noAssert)checkInt(this,value,offset,2,65535,0);this[offset]=value>>>8;this[offset+1]=value&255;return offset+2};Buffer.prototype.writeUInt32LE=function writeUInt32LE(value,offset,noAssert){value=+value;offset=offset>>>0;if(!noAssert)checkInt(this,value,offset,4,4294967295,0);this[offset+3]=value>>>24;this[offset+2]=value>>>16;this[offset+1]=value>>>8;this[offset]=value&255;return offset+4};Buffer.prototype.writeUInt32BE=function writeUInt32BE(value,offset,noAssert){value=+value;offset=offset>>>0;if(!noAssert)checkInt(this,value,offset,4,4294967295,0);this[offset]=value>>>24;this[offset+1]=value>>>16;this[offset+2]=value>>>8;this[offset+3]=value&255;return offset+4};Buffer.prototype.writeIntLE=function writeIntLE(value,offset,byteLength,noAssert){value=+value;offset=offset>>>0;if(!noAssert){var limit=Math.pow(2,8*byteLength-1);checkInt(this,value,offset,byteLength,limit-1,-limit);}var i=0;var mul=1;var sub=0;this[offset]=value&255;while(++i<byteLength&&(mul*=256)){if(value<0&&sub===0&&this[offset+i-1]!==0){sub=1;}this[offset+i]=(value/mul>>0)-sub&255;}return offset+byteLength};Buffer.prototype.writeIntBE=function writeIntBE(value,offset,byteLength,noAssert){value=+value;offset=offset>>>0;if(!noAssert){var limit=Math.pow(2,8*byteLength-1);checkInt(this,value,offset,byteLength,limit-1,-limit);}var i=byteLength-1;var mul=1;var sub=0;this[offset+i]=value&255;while(--i>=0&&(mul*=256)){if(value<0&&sub===0&&this[offset+i+1]!==0){sub=1;}this[offset+i]=(value/mul>>0)-sub&255;}return offset+byteLength};Buffer.prototype.writeInt8=function writeInt8(value,offset,noAssert){value=+value;offset=offset>>>0;if(!noAssert)checkInt(this,value,offset,1,127,-128);if(value<0)value=255+value+1;this[offset]=value&255;return offset+1};Buffer.prototype.writeInt16LE=function writeInt16LE(value,offset,noAssert){value=+value;offset=offset>>>0;if(!noAssert)checkInt(this,value,offset,2,32767,-32768);this[offset]=value&255;this[offset+1]=value>>>8;return offset+2};Buffer.prototype.writeInt16BE=function writeInt16BE(value,offset,noAssert){value=+value;offset=offset>>>0;if(!noAssert)checkInt(this,value,offset,2,32767,-32768);this[offset]=value>>>8;this[offset+1]=value&255;return offset+2};Buffer.prototype.writeInt32LE=function writeInt32LE(value,offset,noAssert){value=+value;offset=offset>>>0;if(!noAssert)checkInt(this,value,offset,4,2147483647,-2147483648);this[offset]=value&255;this[offset+1]=value>>>8;this[offset+2]=value>>>16;this[offset+3]=value>>>24;return offset+4};Buffer.prototype.writeInt32BE=function writeInt32BE(value,offset,noAssert){value=+value;offset=offset>>>0;if(!noAssert)checkInt(this,value,offset,4,2147483647,-2147483648);if(value<0)value=4294967295+value+1;this[offset]=value>>>24;this[offset+1]=value>>>16;this[offset+2]=value>>>8;this[offset+3]=value&255;return offset+4};function checkIEEE754(buf,value,offset,ext,max,min){if(offset+ext>buf.length)throw new RangeError("Index out of range");if(offset<0)throw new RangeError("Index out of range")}function writeFloat(buf,value,offset,littleEndian,noAssert){value=+value;offset=offset>>>0;if(!noAssert){checkIEEE754(buf,value,offset,4,3.4028234663852886e38,-3.4028234663852886e38);}ieee754.write(buf,value,offset,littleEndian,23,4);return offset+4}Buffer.prototype.writeFloatLE=function writeFloatLE(value,offset,noAssert){return writeFloat(this,value,offset,true,noAssert)};Buffer.prototype.writeFloatBE=function writeFloatBE(value,offset,noAssert){return writeFloat(this,value,offset,false,noAssert)};function writeDouble(buf,value,offset,littleEndian,noAssert){value=+value;offset=offset>>>0;if(!noAssert){checkIEEE754(buf,value,offset,8,1.7976931348623157e308,-1.7976931348623157e308);}ieee754.write(buf,value,offset,littleEndian,52,8);return offset+8}Buffer.prototype.writeDoubleLE=function writeDoubleLE(value,offset,noAssert){return writeDouble(this,value,offset,true,noAssert)};Buffer.prototype.writeDoubleBE=function writeDoubleBE(value,offset,noAssert){return writeDouble(this,value,offset,false,noAssert)};Buffer.prototype.copy=function copy(target,targetStart,start,end){if(!start)start=0;if(!end&&end!==0)end=this.length;if(targetStart>=target.length)targetStart=target.length;if(!targetStart)targetStart=0;if(end>0&&end<start)end=start;if(end===start)return 0;if(target.length===0||this.length===0)return 0;if(targetStart<0){throw new RangeError("targetStart out of bounds")}if(start<0||start>=this.length)throw new RangeError("sourceStart out of bounds");if(end<0)throw new RangeError("sourceEnd out of bounds");if(end>this.length)end=this.length;if(target.length-targetStart<end-start){end=target.length-targetStart+start;}var len=end-start;var i;if(this===target&&start<targetStart&&targetStart<end){for(i=len-1;i>=0;--i){target[i+targetStart]=this[i+start];}}else if(len<1e3){for(i=0;i<len;++i){target[i+targetStart]=this[i+start];}}else{Uint8Array.prototype.set.call(target,this.subarray(start,start+len),targetStart);}return len};Buffer.prototype.fill=function fill(val,start,end,encoding){if(typeof val==="string"){if(typeof start==="string"){encoding=start;start=0;end=this.length;}else if(typeof end==="string"){encoding=end;end=this.length;}if(val.length===1){var code=val.charCodeAt(0);if(code<256){val=code;}}if(encoding!==undefined&&typeof encoding!=="string"){throw new TypeError("encoding must be a string")}if(typeof encoding==="string"&&!Buffer.isEncoding(encoding)){throw new TypeError("Unknown encoding: "+encoding)}}else if(typeof val==="number"){val=val&255;}if(start<0||this.length<start||this.length<end){throw new RangeError("Out of range index")}if(end<=start){return this}start=start>>>0;end=end===undefined?this.length:end>>>0;if(!val)val=0;var i;if(typeof val==="number"){for(i=start;i<end;++i){this[i]=val;}}else{var bytes=Buffer.isBuffer(val)?val:new Buffer(val,encoding);var len=bytes.length;for(i=0;i<end-start;++i){this[i+start]=bytes[i%len];}}return this};var INVALID_BASE64_RE=/[^+\/0-9A-Za-z-_]/g;function base64clean(str){str=stringtrim(str).replace(INVALID_BASE64_RE,"");if(str.length<2)return"";while(str.length%4!==0){str=str+"=";}return str}function stringtrim(str){if(str.trim)return str.trim();return str.replace(/^\s+|\s+$/g,"")}function toHex(n){if(n<16)return"0"+n.toString(16);return n.toString(16)}function utf8ToBytes(string,units){units=units||Infinity;var codePoint;var length=string.length;var leadSurrogate=null;var bytes=[];for(var i=0;i<length;++i){codePoint=string.charCodeAt(i);if(codePoint>55295&&codePoint<57344){if(!leadSurrogate){if(codePoint>56319){if((units-=3)>-1)bytes.push(239,191,189);continue}else if(i+1===length){if((units-=3)>-1)bytes.push(239,191,189);continue}leadSurrogate=codePoint;continue}if(codePoint<56320){if((units-=3)>-1)bytes.push(239,191,189);leadSurrogate=codePoint;continue}codePoint=(leadSurrogate-55296<<10|codePoint-56320)+65536;}else if(leadSurrogate){if((units-=3)>-1)bytes.push(239,191,189);}leadSurrogate=null;if(codePoint<128){if((units-=1)<0)break;bytes.push(codePoint);}else if(codePoint<2048){if((units-=2)<0)break;bytes.push(codePoint>>6|192,codePoint&63|128);}else if(codePoint<65536){if((units-=3)<0)break;bytes.push(codePoint>>12|224,codePoint>>6&63|128,codePoint&63|128);}else if(codePoint<1114112){if((units-=4)<0)break;bytes.push(codePoint>>18|240,codePoint>>12&63|128,codePoint>>6&63|128,codePoint&63|128);}else{throw new Error("Invalid code point")}}return bytes}function asciiToBytes(str){var byteArray=[];for(var i=0;i<str.length;++i){byteArray.push(str.charCodeAt(i)&255);}return byteArray}function utf16leToBytes(str,units){var c,hi,lo;var byteArray=[];for(var i=0;i<str.length;++i){if((units-=2)<0)break;c=str.charCodeAt(i);hi=c>>8;lo=c%256;byteArray.push(lo);byteArray.push(hi);}return byteArray}function base64ToBytes(str){return base64.toByteArray(base64clean(str))}function blitBuffer(src,dst,offset,length){for(var i=0;i<length;++i){if(i+offset>=dst.length||i>=src.length)break;dst[i+offset]=src[i];}return i}function isnan(val){return val!==val}},{"base64-js":8,ieee754:18}],12:[function(require,module,exports){(function(global){"use strict";var buffer=require("buffer");var Buffer=buffer.Buffer;var SlowBuffer=buffer.SlowBuffer;var MAX_LEN=buffer.kMaxLength||2147483647;exports.alloc=function alloc(size,fill,encoding){if(typeof Buffer.alloc==="function"){return Buffer.alloc(size,fill,encoding)}if(typeof encoding==="number"){throw new TypeError("encoding must not be number")}if(typeof size!=="number"){throw new TypeError("size must be a number")}if(size>MAX_LEN){throw new RangeError("size is too large")}var enc=encoding;var _fill=fill;if(_fill===undefined){enc=undefined;_fill=0;}var buf=new Buffer(size);if(typeof _fill==="string"){var fillBuf=new Buffer(_fill,enc);var flen=fillBuf.length;var i=-1;while(++i<size){buf[i]=fillBuf[i%flen];}}else{buf.fill(_fill);}return buf};exports.allocUnsafe=function allocUnsafe(size){if(typeof Buffer.allocUnsafe==="function"){return Buffer.allocUnsafe(size)}if(typeof size!=="number"){throw new TypeError("size must be a number")}if(size>MAX_LEN){throw new RangeError("size is too large")}return new Buffer(size)};exports.from=function from(value,encodingOrOffset,length){if(typeof Buffer.from==="function"&&(!global.Uint8Array||Uint8Array.from!==Buffer.from)){return Buffer.from(value,encodingOrOffset,length)}if(typeof value==="number"){throw new TypeError('"value" argument must not be a number')}if(typeof value==="string"){return new Buffer(value,encodingOrOffset)}if(typeof ArrayBuffer!=="undefined"&&value instanceof ArrayBuffer){var offset=encodingOrOffset;if(arguments.length===1){return new Buffer(value)}if(typeof offset==="undefined"){offset=0;}var len=length;if(typeof len==="undefined"){len=value.byteLength-offset;}if(offset>=value.byteLength){throw new RangeError("'offset' is out of bounds")}if(len>value.byteLength-offset){throw new RangeError("'length' is out of bounds")}return new Buffer(value.slice(offset,offset+len))}if(Buffer.isBuffer(value)){var out=new Buffer(value.length);value.copy(out,0,0,value.length);return out}if(value){if(Array.isArray(value)||typeof ArrayBuffer!=="undefined"&&value.buffer instanceof ArrayBuffer||"length"in value){return new Buffer(value)}if(value.type==="Buffer"&&Array.isArray(value.data)){return new Buffer(value.data)}}throw new TypeError("First argument must be a string, Buffer, "+"ArrayBuffer, Array, or array-like object.")};exports.allocUnsafeSlow=function allocUnsafeSlow(size){if(typeof Buffer.allocUnsafeSlow==="function"){return Buffer.allocUnsafeSlow(size)}if(typeof size!=="number"){throw new TypeError("size must be a number")}if(size>=MAX_LEN){throw new RangeError("size is too large")}return new SlowBuffer(size)};}).call(this,typeof commonjsGlobal!=="undefined"?commonjsGlobal:typeof self!=="undefined"?self:typeof window!=="undefined"?window:{});},{buffer:11}],13:[function(require,module,exports){(function(Buffer){function isArray(arg){if(Array.isArray){return Array.isArray(arg)}return objectToString(arg)==="[object Array]"}exports.isArray=isArray;function isBoolean(arg){return typeof arg==="boolean"}exports.isBoolean=isBoolean;function isNull(arg){return arg===null}exports.isNull=isNull;function isNullOrUndefined(arg){return arg==null}exports.isNullOrUndefined=isNullOrUndefined;function isNumber(arg){return typeof arg==="number"}exports.isNumber=isNumber;function isString(arg){return typeof arg==="string"}exports.isString=isString;function isSymbol(arg){return typeof arg==="symbol"}exports.isSymbol=isSymbol;function isUndefined(arg){return arg===void 0}exports.isUndefined=isUndefined;function isRegExp(re){return objectToString(re)==="[object RegExp]"}exports.isRegExp=isRegExp;function isObject(arg){return typeof arg==="object"&&arg!==null}exports.isObject=isObject;function isDate(d){return objectToString(d)==="[object Date]"}exports.isDate=isDate;function isError(e){return objectToString(e)==="[object Error]"||e instanceof Error}exports.isError=isError;function isFunction(arg){return typeof arg==="function"}exports.isFunction=isFunction;function isPrimitive(arg){return arg===null||typeof arg==="boolean"||typeof arg==="number"||typeof arg==="string"||typeof arg==="symbol"||typeof arg==="undefined"}exports.isPrimitive=isPrimitive;exports.isBuffer=Buffer.isBuffer;function objectToString(o){return Object.prototype.toString.call(o)}}).call(this,{isBuffer:require("../../is-buffer/index.js")});},{"../../is-buffer/index.js":20}],14:[function(require,module,exports){(function(process,Buffer){var stream=require("readable-stream");var eos=require("end-of-stream");var inherits=require("inherits");var shift=require("stream-shift");var SIGNAL_FLUSH=new Buffer([0]);var onuncork=function(self,fn){if(self._corked)self.once("uncork",fn);else fn();};var destroyer=function(self,end){return function(err){if(err)self.destroy(err.message==="premature close"?null:err);else if(end&&!self._ended)self.end();}};var end=function(ws,fn){if(!ws)return fn();if(ws._writableState&&ws._writableState.finished)return fn();if(ws._writableState)return ws.end(fn);ws.end();fn();};var toStreams2=function(rs){return new stream.Readable({objectMode:true,highWaterMark:16}).wrap(rs)};var Duplexify=function(writable,readable,opts){if(!(this instanceof Duplexify))return new Duplexify(writable,readable,opts);stream.Duplex.call(this,opts);this._writable=null;this._readable=null;this._readable2=null;this._forwardDestroy=!opts||opts.destroy!==false;this._forwardEnd=!opts||opts.end!==false;this._corked=1;this._ondrain=null;this._drained=false;this._forwarding=false;this._unwrite=null;this._unread=null;this._ended=false;this.destroyed=false;if(writable)this.setWritable(writable);if(readable)this.setReadable(readable);};inherits(Duplexify,stream.Duplex);Duplexify.obj=function(writable,readable,opts){if(!opts)opts={};opts.objectMode=true;opts.highWaterMark=16;return new Duplexify(writable,readable,opts)};Duplexify.prototype.cork=function(){if(++this._corked===1)this.emit("cork");};Duplexify.prototype.uncork=function(){if(this._corked&&--this._corked===0)this.emit("uncork");};Duplexify.prototype.setWritable=function(writable){if(this._unwrite)this._unwrite();if(this.destroyed){if(writable&&writable.destroy)writable.destroy();return}if(writable===null||writable===false){this.end();return}var self=this;var unend=eos(writable,{writable:true,readable:false},destroyer(this,this._forwardEnd));var ondrain=function(){var ondrain=self._ondrain;self._ondrain=null;if(ondrain)ondrain();};var clear=function(){self._writable.removeListener("drain",ondrain);unend();};if(this._unwrite)process.nextTick(ondrain);this._writable=writable;this._writable.on("drain",ondrain);this._unwrite=clear;this.uncork();};Duplexify.prototype.setReadable=function(readable){if(this._unread)this._unread();if(this.destroyed){if(readable&&readable.destroy)readable.destroy();return}if(readable===null||readable===false){this.push(null);this.resume();return}var self=this;var unend=eos(readable,{writable:false,readable:true},destroyer(this));var onreadable=function(){self._forward();};var onend=function(){self.push(null);};var clear=function(){self._readable2.removeListener("readable",onreadable);self._readable2.removeListener("end",onend);unend();};this._drained=true;this._readable=readable;this._readable2=readable._readableState?readable:toStreams2(readable);this._readable2.on("readable",onreadable);
this._readable2.on("end",onend);this._unread=clear;this._forward();};Duplexify.prototype._read=function(){this._drained=true;this._forward();};Duplexify.prototype._forward=function(){if(this._forwarding||!this._readable2||!this._drained)return;this._forwarding=true;var data;while(this._drained&&(data=shift(this._readable2))!==null){if(this.destroyed)continue;this._drained=this.push(data);}this._forwarding=false;};Duplexify.prototype.destroy=function(err){if(this.destroyed)return;this.destroyed=true;var self=this;process.nextTick(function(){self._destroy(err);});};Duplexify.prototype._destroy=function(err){if(err){var ondrain=this._ondrain;this._ondrain=null;if(ondrain)ondrain(err);else this.emit("error",err);}if(this._forwardDestroy){if(this._readable&&this._readable.destroy)this._readable.destroy();if(this._writable&&this._writable.destroy)this._writable.destroy();}this.emit("close");};Duplexify.prototype._write=function(data,enc,cb){if(this.destroyed)return cb();if(this._corked)return onuncork(this,this._write.bind(this,data,enc,cb));if(data===SIGNAL_FLUSH)return this._finish(cb);if(!this._writable)return cb();if(this._writable.write(data)===false)this._ondrain=cb;else cb();};Duplexify.prototype._finish=function(cb){var self=this;this.emit("preend");onuncork(this,function(){end(self._forwardEnd&&self._writable,function(){if(self._writableState.prefinished===false)self._writableState.prefinished=true;self.emit("prefinish");onuncork(self,cb);});});};Duplexify.prototype.end=function(data,enc,cb){if(typeof data==="function")return this.end(null,null,data);if(typeof enc==="function")return this.end(data,null,enc);this._ended=true;if(data)this.write(data);if(!this._writableState.ending)this.write(SIGNAL_FLUSH);return stream.Writable.prototype.end.call(this,cb)};module.exports=Duplexify;}).call(this,require("_process"),require("buffer").Buffer);},{_process:31,buffer:11,"end-of-stream":15,inherits:19,"readable-stream":43,"stream-shift":46}],15:[function(require,module,exports){var once=require("once");var noop=function(){};var isRequest=function(stream){return stream.setHeader&&typeof stream.abort==="function"};var eos=function(stream,opts,callback){if(typeof opts==="function")return eos(stream,null,opts);if(!opts)opts={};callback=once(callback||noop);var ws=stream._writableState;var rs=stream._readableState;var readable=opts.readable||opts.readable!==false&&stream.readable;var writable=opts.writable||opts.writable!==false&&stream.writable;var onlegacyfinish=function(){if(!stream.writable)onfinish();};var onfinish=function(){writable=false;if(!readable)callback();};var onend=function(){readable=false;if(!writable)callback();};var onclose=function(){if(readable&&!(rs&&rs.ended))return callback(new Error("premature close"));if(writable&&!(ws&&ws.ended))return callback(new Error("premature close"))};var onrequest=function(){stream.req.on("finish",onfinish);};if(isRequest(stream)){stream.on("complete",onfinish);stream.on("abort",onclose);if(stream.req)onrequest();else stream.on("request",onrequest);}else if(writable&&!ws){stream.on("end",onlegacyfinish);stream.on("close",onlegacyfinish);}stream.on("end",onend);stream.on("finish",onfinish);if(opts.error!==false)stream.on("error",callback);stream.on("close",onclose);return function(){stream.removeListener("complete",onfinish);stream.removeListener("abort",onclose);stream.removeListener("request",onrequest);if(stream.req)stream.req.removeListener("finish",onfinish);stream.removeListener("end",onlegacyfinish);stream.removeListener("close",onlegacyfinish);stream.removeListener("finish",onfinish);stream.removeListener("end",onend);stream.removeListener("error",callback);stream.removeListener("close",onclose);}};module.exports=eos;},{once:29}],16:[function(require,module,exports){var once=require("once");var noop=function(){};var isRequest=function(stream){return stream.setHeader&&typeof stream.abort==="function"};var isChildProcess=function(stream){return stream.stdio&&Array.isArray(stream.stdio)&&stream.stdio.length===3};var eos=function(stream,opts,callback){if(typeof opts==="function")return eos(stream,null,opts);if(!opts)opts={};callback=once(callback||noop);var ws=stream._writableState;var rs=stream._readableState;var readable=opts.readable||opts.readable!==false&&stream.readable;var writable=opts.writable||opts.writable!==false&&stream.writable;var onlegacyfinish=function(){if(!stream.writable)onfinish();};var onfinish=function(){writable=false;if(!readable)callback();};var onend=function(){readable=false;if(!writable)callback();};var onexit=function(exitCode){callback(exitCode?new Error("exited with error code: "+exitCode):null);};var onclose=function(){if(readable&&!(rs&&rs.ended))return callback(new Error("premature close"));if(writable&&!(ws&&ws.ended))return callback(new Error("premature close"))};var onrequest=function(){stream.req.on("finish",onfinish);};if(isRequest(stream)){stream.on("complete",onfinish);stream.on("abort",onclose);if(stream.req)onrequest();else stream.on("request",onrequest);}else if(writable&&!ws){stream.on("end",onlegacyfinish);stream.on("close",onlegacyfinish);}if(isChildProcess(stream))stream.on("exit",onexit);stream.on("end",onend);stream.on("finish",onfinish);if(opts.error!==false)stream.on("error",callback);stream.on("close",onclose);return function(){stream.removeListener("complete",onfinish);stream.removeListener("abort",onclose);stream.removeListener("request",onrequest);if(stream.req)stream.req.removeListener("finish",onfinish);stream.removeListener("end",onlegacyfinish);stream.removeListener("close",onlegacyfinish);stream.removeListener("finish",onfinish);stream.removeListener("exit",onexit);stream.removeListener("end",onend);stream.removeListener("error",callback);stream.removeListener("close",onclose);}};module.exports=eos;},{once:29}],17:[function(require,module,exports){function EventEmitter(){this._events=this._events||{};this._maxListeners=this._maxListeners||undefined;}module.exports=EventEmitter;EventEmitter.EventEmitter=EventEmitter;EventEmitter.prototype._events=undefined;EventEmitter.prototype._maxListeners=undefined;EventEmitter.defaultMaxListeners=10;EventEmitter.prototype.setMaxListeners=function(n){if(!isNumber(n)||n<0||isNaN(n))throw TypeError("n must be a positive number");this._maxListeners=n;return this};EventEmitter.prototype.emit=function(type){var er,handler,len,args,i,listeners;if(!this._events)this._events={};if(type==="error"){if(!this._events.error||isObject(this._events.error)&&!this._events.error.length){er=arguments[1];if(er instanceof Error){throw er}else{var err=new Error('Uncaught, unspecified "error" event. ('+er+")");err.context=er;throw err}}}handler=this._events[type];if(isUndefined(handler))return false;if(isFunction(handler)){switch(arguments.length){case 1:handler.call(this);break;case 2:handler.call(this,arguments[1]);break;case 3:handler.call(this,arguments[1],arguments[2]);break;default:args=Array.prototype.slice.call(arguments,1);handler.apply(this,args);}}else if(isObject(handler)){args=Array.prototype.slice.call(arguments,1);listeners=handler.slice();len=listeners.length;for(i=0;i<len;i++)listeners[i].apply(this,args);}return true};EventEmitter.prototype.addListener=function(type,listener){var m;if(!isFunction(listener))throw TypeError("listener must be a function");if(!this._events)this._events={};if(this._events.newListener)this.emit("newListener",type,isFunction(listener.listener)?listener.listener:listener);if(!this._events[type])this._events[type]=listener;else if(isObject(this._events[type]))this._events[type].push(listener);else this._events[type]=[this._events[type],listener];if(isObject(this._events[type])&&!this._events[type].warned){if(!isUndefined(this._maxListeners)){m=this._maxListeners;}else{m=EventEmitter.defaultMaxListeners;}if(m&&m>0&&this._events[type].length>m){this._events[type].warned=true;console.error("(node) warning: possible EventEmitter memory "+"leak detected. %d listeners added. "+"Use emitter.setMaxListeners() to increase limit.",this._events[type].length);if(typeof console.trace==="function"){console.trace();}}}return this};EventEmitter.prototype.on=EventEmitter.prototype.addListener;EventEmitter.prototype.once=function(type,listener){if(!isFunction(listener))throw TypeError("listener must be a function");var fired=false;function g(){this.removeListener(type,g);if(!fired){fired=true;listener.apply(this,arguments);}}g.listener=listener;this.on(type,g);return this};EventEmitter.prototype.removeListener=function(type,listener){var list,position,length,i;if(!isFunction(listener))throw TypeError("listener must be a function");if(!this._events||!this._events[type])return this;list=this._events[type];length=list.length;position=-1;if(list===listener||isFunction(list.listener)&&list.listener===listener){delete this._events[type];if(this._events.removeListener)this.emit("removeListener",type,listener);}else if(isObject(list)){for(i=length;i-- >0;){if(list[i]===listener||list[i].listener&&list[i].listener===listener){position=i;break}}if(position<0)return this;if(list.length===1){list.length=0;delete this._events[type];}else{list.splice(position,1);}if(this._events.removeListener)this.emit("removeListener",type,listener);}return this};EventEmitter.prototype.removeAllListeners=function(type){var key,listeners;if(!this._events)return this;if(!this._events.removeListener){if(arguments.length===0)this._events={};else if(this._events[type])delete this._events[type];return this}if(arguments.length===0){for(key in this._events){if(key==="removeListener")continue;this.removeAllListeners(key);}this.removeAllListeners("removeListener");this._events={};return this}listeners=this._events[type];if(isFunction(listeners)){this.removeListener(type,listeners);}else if(listeners){while(listeners.length)this.removeListener(type,listeners[listeners.length-1]);}delete this._events[type];return this};EventEmitter.prototype.listeners=function(type){var ret;if(!this._events||!this._events[type])ret=[];else if(isFunction(this._events[type]))ret=[this._events[type]];else ret=this._events[type].slice();return ret};EventEmitter.prototype.listenerCount=function(type){if(this._events){var evlistener=this._events[type];if(isFunction(evlistener))return 1;else if(evlistener)return evlistener.length}return 0};EventEmitter.listenerCount=function(emitter,type){return emitter.listenerCount(type)};function isFunction(arg){return typeof arg==="function"}function isNumber(arg){return typeof arg==="number"}function isObject(arg){return typeof arg==="object"&&arg!==null}function isUndefined(arg){return arg===void 0}},{}],18:[function(require,module,exports){exports.read=function(buffer,offset,isLE,mLen,nBytes){var e,m;var eLen=nBytes*8-mLen-1;var eMax=(1<<eLen)-1;var eBias=eMax>>1;var nBits=-7;var i=isLE?nBytes-1:0;var d=isLE?-1:1;var s=buffer[offset+i];i+=d;e=s&(1<<-nBits)-1;s>>=-nBits;nBits+=eLen;for(;nBits>0;e=e*256+buffer[offset+i],i+=d,nBits-=8){}m=e&(1<<-nBits)-1;e>>=-nBits;nBits+=mLen;for(;nBits>0;m=m*256+buffer[offset+i],i+=d,nBits-=8){}if(e===0){e=1-eBias;}else if(e===eMax){return m?NaN:(s?-1:1)*Infinity}else{m=m+Math.pow(2,mLen);e=e-eBias;}return(s?-1:1)*m*Math.pow(2,e-mLen)};exports.write=function(buffer,value,offset,isLE,mLen,nBytes){var e,m,c;var eLen=nBytes*8-mLen-1;var eMax=(1<<eLen)-1;var eBias=eMax>>1;var rt=mLen===23?Math.pow(2,-24)-Math.pow(2,-77):0;var i=isLE?0:nBytes-1;var d=isLE?1:-1;var s=value<0||value===0&&1/value<0?1:0;value=Math.abs(value);if(isNaN(value)||value===Infinity){m=isNaN(value)?1:0;e=eMax;}else{e=Math.floor(Math.log(value)/Math.LN2);if(value*(c=Math.pow(2,-e))<1){e--;c*=2;}if(e+eBias>=1){value+=rt/c;}else{value+=rt*Math.pow(2,1-eBias);}if(value*c>=2){e++;c/=2;}if(e+eBias>=eMax){m=0;e=eMax;}else if(e+eBias>=1){m=(value*c-1)*Math.pow(2,mLen);e=e+eBias;}else{m=value*Math.pow(2,eBias-1)*Math.pow(2,mLen);e=0;}}for(;mLen>=8;buffer[offset+i]=m&255,i+=d,m/=256,mLen-=8){}e=e<<mLen|m;eLen+=mLen;for(;eLen>0;buffer[offset+i]=e&255,i+=d,e/=256,eLen-=8){}buffer[offset+i-d]|=s*128;};},{}],19:[function(require,module,exports){if(typeof Object.create==="function"){module.exports=function inherits(ctor,superCtor){ctor.super_=superCtor;ctor.prototype=Object.create(superCtor.prototype,{constructor:{value:ctor,enumerable:false,writable:true,configurable:true}});};}else{module.exports=function inherits(ctor,superCtor){ctor.super_=superCtor;var TempCtor=function(){};TempCtor.prototype=superCtor.prototype;ctor.prototype=new TempCtor;ctor.prototype.constructor=ctor;};}},{}],20:[function(require,module,exports){module.exports=function(obj){return obj!=null&&(isBuffer(obj)||isSlowBuffer(obj)||!!obj._isBuffer)};function isBuffer(obj){return!!obj.constructor&&typeof obj.constructor.isBuffer==="function"&&obj.constructor.isBuffer(obj)}function isSlowBuffer(obj){return typeof obj.readFloatLE==="function"&&typeof obj.slice==="function"&&isBuffer(obj.slice(0,0))}},{}],21:[function(require,module,exports){var toString={}.toString;module.exports=Array.isArray||function(arr){return toString.call(arr)=="[object Array]"};},{}],22:[function(require,module,exports){(function(Buffer){var protocol=module.exports;protocol.types={0:"reserved",1:"connect",2:"connack",3:"publish",4:"puback",5:"pubrec",6:"pubrel",7:"pubcomp",8:"subscribe",9:"suback",10:"unsubscribe",11:"unsuback",12:"pingreq",13:"pingresp",14:"disconnect",15:"reserved"};protocol.codes={};for(var k in protocol.types){var v=protocol.types[k];protocol.codes[v]=k;}protocol.CMD_SHIFT=4;protocol.CMD_MASK=240;protocol.DUP_MASK=8;protocol.QOS_MASK=3;protocol.QOS_SHIFT=1;protocol.RETAIN_MASK=1;protocol.LENGTH_MASK=127;protocol.LENGTH_FIN_MASK=128;protocol.SESSIONPRESENT_MASK=1;protocol.SESSIONPRESENT_HEADER=new Buffer([protocol.SESSIONPRESENT_MASK]);protocol.CONNACK_HEADER=new Buffer([protocol.codes["connack"]<<protocol.CMD_SHIFT]);protocol.USERNAME_MASK=128;protocol.PASSWORD_MASK=64;protocol.WILL_RETAIN_MASK=32;protocol.WILL_QOS_MASK=24;protocol.WILL_QOS_SHIFT=3;protocol.WILL_FLAG_MASK=4;protocol.CLEAN_SESSION_MASK=2;protocol.CONNECT_HEADER=new Buffer([protocol.codes["connect"]<<protocol.CMD_SHIFT]);function genHeader(type){return[0,1,2].map(function(qos){return[0,1].map(function(dup){return[0,1].map(function(retain){var buf=new Buffer(1);buf.writeUInt8(protocol.codes[type]<<protocol.CMD_SHIFT|(dup?protocol.DUP_MASK:0)|qos<<protocol.QOS_SHIFT|retain,0,true);return buf})})})}protocol.PUBLISH_HEADER=genHeader("publish");protocol.SUBSCRIBE_HEADER=genHeader("subscribe");protocol.UNSUBSCRIBE_HEADER=genHeader("unsubscribe");protocol.ACKS={unsuback:genHeader("unsuback"),puback:genHeader("puback"),pubcomp:genHeader("pubcomp"),pubrel:genHeader("pubrel"),pubrec:genHeader("pubrec")};protocol.SUBACK_HEADER=new Buffer([protocol.codes["suback"]<<protocol.CMD_SHIFT]);protocol.VERSION3=new Buffer([3]);protocol.VERSION4=new Buffer([4]);protocol.QOS=[0,1,2].map(function(qos){return new Buffer([qos])});protocol.EMPTY={pingreq:new Buffer([protocol.codes["pingreq"]<<4,0]),pingresp:new Buffer([protocol.codes["pingresp"]<<4,0]),disconnect:new Buffer([protocol.codes["disconnect"]<<4,0])};}).call(this,require("buffer").Buffer);},{buffer:11}],23:[function(require,module,exports){(function(Buffer){"use strict";var writeToStream=require("./writeToStream");var EE=require("events").EventEmitter;var inherits=require("inherits");function generate(packet){var stream=new Accumulator;writeToStream(packet,stream);return stream.concat()}function Accumulator(){this._array=new Array(20);this._i=0;}inherits(Accumulator,EE);Accumulator.prototype.write=function(chunk){this._array[this._i++]=chunk;return true};Accumulator.prototype.concat=function(){var length=0;var lengths=new Array(this._array.length);var list=this._array;var pos=0;var i;var result;for(i=0;i<list.length&&list[i];i++){if(typeof list[i]!=="string")lengths[i]=list[i].length;else lengths[i]=Buffer.byteLength(list[i]);length+=lengths[i];}result=new Buffer(length);for(i=0;i<list.length&&list[i];i++){if(typeof list[i]!=="string"){list[i].copy(result,pos);pos+=lengths[i];}else{result.write(list[i],pos);pos+=lengths[i];}}return result};module.exports=generate;}).call(this,require("buffer").Buffer);},{"./writeToStream":28,buffer:11,events:17,inherits:19}],24:[function(require,module,exports){"use strict";exports.parser=require("./parser");exports.generate=require("./generate");exports.writeToStream=require("./writeToStream");},{"./generate":23,"./parser":27,"./writeToStream":28}],25:[function(require,module,exports){(function(Buffer){"use strict";var max=65536;var cache={};var buffer;for(var i=0;i<max;i++){buffer=new Buffer(2);buffer.writeUInt8(i>>8,0,true);buffer.writeUInt8(i&255,0+1,true);cache[i]=buffer;}module.exports=cache;}).call(this,require("buffer").Buffer);},{buffer:11}],26:[function(require,module,exports){function Packet(){this.cmd=null;this.retain=false;this.qos=0;this.dup=false;this.length=-1;this.topic=null;this.payload=null;}module.exports=Packet;},{}],27:[function(require,module,exports){"use strict";var bl=require("bl");var inherits=require("inherits");var EE=require("events").EventEmitter;var Packet=require("./packet");var constants=require("./constants");function Parser(){if(!(this instanceof Parser))return new Parser;this._states=["_parseHeader","_parseLength","_parsePayload","_newPacket"];this._resetState();}inherits(Parser,EE);Parser.prototype._resetState=function(){this.packet=new Packet;this.error=null;this._list=bl();this._stateCounter=0;};Parser.prototype.parse=function(buf){if(this.error)this._resetState();this._list.append(buf);while((this.packet.length!==-1||this._list.length>0)&&this[this._states[this._stateCounter]]()&&!this.error){this._stateCounter++;if(this._stateCounter>=this._states.length)this._stateCounter=0;}return this._list.length};Parser.prototype._parseHeader=function(){var zero=this._list.readUInt8(0);this.packet.cmd=constants.types[zero>>constants.CMD_SHIFT];this.packet.retain=(zero&constants.RETAIN_MASK)!==0;this.packet.qos=zero>>constants.QOS_SHIFT&constants.QOS_MASK;this.packet.dup=(zero&constants.DUP_MASK)!==0;this._list.consume(1);return true};Parser.prototype._parseLength=function(){var bytes=0;var mul=1;var length=0;var result=true;var current;while(bytes<5){current=this._list.readUInt8(bytes++);length+=mul*(current&constants.LENGTH_MASK);mul*=128;if((current&constants.LENGTH_FIN_MASK)===0)break;if(this._list.length<=bytes){result=false;break}}if(result){this.packet.length=length;this._list.consume(bytes);}return result};Parser.prototype._parsePayload=function(){var result=false;if(this.packet.length===0||this._list.length>=this.packet.length){this._pos=0;switch(this.packet.cmd){case"connect":this._parseConnect();break;case"connack":this._parseConnack();break;case"publish":this._parsePublish();break;case"puback":case"pubrec":case"pubrel":case"pubcomp":this._parseMessageId();break;case"subscribe":this._parseSubscribe();break;case"suback":this._parseSuback();break;case"unsubscribe":this._parseUnsubscribe();break;case"unsuback":this._parseUnsuback();break;case"pingreq":case"pingresp":case"disconnect":break;default:this._emitError(new Error("Not supported"));}result=true;}return result};Parser.prototype._parseConnect=function(){var protocolId;var clientId;var topic;var payload;var password;var username;var flags={};var packet=this.packet;protocolId=this._parseString();if(protocolId===null)return this._emitError(new Error("Cannot parse protocol id"));if(protocolId!=="MQTT"&&protocolId!=="MQIsdp"){return this._emitError(new Error("Invalid protocol id"))}packet.protocolId=protocolId;if(this._pos>=this._list.length)return this._emitError(new Error("Packet too short"));packet.protocolVersion=this._list.readUInt8(this._pos);if(packet.protocolVersion!==3&&packet.protocolVersion!==4){return this._emitError(new Error("Invalid protocol version"))}this._pos++;if(this._pos>=this._list.length){return this._emitError(new Error("Packet too short"))}flags.username=this._list.readUInt8(this._pos)&constants.USERNAME_MASK;flags.password=this._list.readUInt8(this._pos)&constants.PASSWORD_MASK;flags.will=this._list.readUInt8(this._pos)&constants.WILL_FLAG_MASK;if(flags.will){packet.will={};packet.will.retain=(this._list.readUInt8(this._pos)&constants.WILL_RETAIN_MASK)!==0;packet.will.qos=(this._list.readUInt8(this._pos)&constants.WILL_QOS_MASK)>>constants.WILL_QOS_SHIFT;}packet.clean=(this._list.readUInt8(this._pos)&constants.CLEAN_SESSION_MASK)!==0;this._pos++;packet.keepalive=this._parseNum();if(packet.keepalive===-1)return this._emitError(new Error("Packet too short"));clientId=this._parseString();if(clientId===null)return this._emitError(new Error("Packet too short"));packet.clientId=clientId;if(flags.will){topic=this._parseString();if(topic===null)return this._emitError(new Error("Cannot parse will topic"));packet.will.topic=topic;payload=this._parseBuffer();if(payload===null)return this._emitError(new Error("Cannot parse will payload"));packet.will.payload=payload;}if(flags.username){username=this._parseString();if(username===null)return this._emitError(new Error("Cannot parse username"));packet.username=username;}if(flags.password){password=this._parseBuffer();if(password===null)return this._emitError(new Error("Cannot parse password"));packet.password=password;}return packet};Parser.prototype._parseConnack=function(){var packet=this.packet;if(this._list.length<2)return null;packet.sessionPresent=!!(this._list.readUInt8(this._pos++)&constants.SESSIONPRESENT_MASK);packet.returnCode=this._list.readUInt8(this._pos);if(packet.returnCode===-1)return this._emitError(new Error("Cannot parse return code"))};Parser.prototype._parsePublish=function(){var packet=this.packet;packet.topic=this._parseString();if(packet.topic===null)return this._emitError(new Error("Cannot parse topic"));if(packet.qos>0)if(!this._parseMessageId()){return}packet.payload=this._list.slice(this._pos,packet.length);};Parser.prototype._parseSubscribe=function(){var packet=this.packet;var topic;var qos;if(packet.qos!==1){return this._emitError(new Error("Wrong subscribe header"))}packet.subscriptions=[];if(!this._parseMessageId()){return}while(this._pos<packet.length){topic=this._parseString();if(topic===null)return this._emitError(new Error("Cannot parse topic"));qos=this._list.readUInt8(this._pos++);packet.subscriptions.push({topic:topic,qos:qos});}};Parser.prototype._parseSuback=function(){this.packet.granted=[];if(!this._parseMessageId()){return}while(this._pos<this.packet.length){this.packet.granted.push(this._list.readUInt8(this._pos++));}};Parser.prototype._parseUnsubscribe=function(){var packet=this.packet;packet.unsubscriptions=[];if(!this._parseMessageId()){return}while(this._pos<packet.length){var topic;topic=this._parseString();if(topic===null)return this._emitError(new Error("Cannot parse topic"));packet.unsubscriptions.push(topic);}};Parser.prototype._parseUnsuback=function(){if(!this._parseMessageId())return this._emitError(new Error("Cannot parse message id"))};Parser.prototype._parseMessageId=function(){var packet=this.packet;packet.messageId=this._parseNum();if(packet.messageId===null){this._emitError(new Error("Cannot parse message id"));return false}return true};Parser.prototype._parseString=function(maybeBuffer){var length=this._parseNum();var result;var end=length+this._pos;if(length===-1||end>this._list.length||end>this.packet.length)return null;result=this._list.toString("utf8",this._pos,end);this._pos+=length;return result};Parser.prototype._parseBuffer=function(){var length=this._parseNum();var result;var end=length+this._pos;if(length===-1||end>this._list.length||end>this.packet.length)return null;result=this._list.slice(this._pos,end);this._pos+=length;return result};Parser.prototype._parseNum=function(){if(this._list.length-this._pos<2)return-1;var result=this._list.readUInt16BE(this._pos);this._pos+=2;return result};Parser.prototype._newPacket=function(){if(this.packet){this._list.consume(this.packet.length);this.emit("packet",this.packet);}this.packet=new Packet;return true};Parser.prototype._emitError=function(err){this.error=err;this.emit("error",err);};module.exports=Parser;},{"./constants":22,"./packet":26,bl:9,events:17,inherits:19}],28:[function(require,module,exports){(function(Buffer){"use strict";var protocol=require("./constants");var empty=new Buffer(0);var zeroBuf=new Buffer([0]);var numCache=require("./numbers");var nextTick=require("process-nextick-args");function generate(packet,stream){if(stream.cork){stream.cork();nextTick(uncork,stream);}switch(packet.cmd){case"connect":return connect(packet,stream);case"connack":return connack(packet,stream);case"publish":return publish(packet,stream);case"puback":case"pubrec":case"pubrel":case"pubcomp":case"unsuback":return confirmation(packet,stream);case"subscribe":return subscribe(packet,stream);case"suback":return suback(packet,stream);case"unsubscribe":return unsubscribe(packet,stream);case"pingreq":case"pingresp":case"disconnect":return emptyPacket(packet,stream);default:stream.emit("error",new Error("Unknown command"));return false}}function uncork(stream){stream.uncork();}function connect(opts,stream){var settings=opts||{};var protocolId=settings.protocolId||"MQTT";var protocolVersion=settings.protocolVersion||4;var will=settings.will;var clean=settings.clean;var keepalive=settings.keepalive||0;var clientId=settings.clientId||"";var username=settings.username;var password=settings.password;if(clean===undefined)clean=true;var length=0;if(!protocolId||typeof protocolId!=="string"&&!Buffer.isBuffer(protocolId)){stream.emit("error",new Error("Invalid protocol id"));return false}else length+=protocolId.length+2;if(protocolVersion!==3&&protocolVersion!==4){stream.emit("error",new Error("Invalid protocol version"));return false}else length+=1;if((typeof clientId==="string"||Buffer.isBuffer(clientId))&&(clientId||protocolVersion===4)&&(clientId||clean)){length+=clientId.length+2;}else{if(protocolVersion<4){stream.emit("error",new Error("clientId must be supplied before 3.1.1"));return false}if(clean*1===0){stream.emit("error",new Error("clientId must be given if cleanSession set to 0"));return false}}if(typeof keepalive!=="number"||keepalive<0||keepalive>65535||keepalive%1!==0){stream.emit("error",new Error("Invalid keepalive"));return false}else length+=2;length+=1;if(will){if(typeof will!=="object"){stream.emit("error",new Error("Invalid will"));return false}if(!will.topic||typeof will.topic!=="string"){stream.emit("error",new Error("Invalid will topic"));return false}else{length+=Buffer.byteLength(will.topic)+2;}if(will.payload&&will.payload){if(will.payload.length>=0){if(typeof will.payload==="string"){length+=Buffer.byteLength(will.payload)+2;}else{length+=will.payload.length+2;}}else{stream.emit("error",new Error("Invalid will payload"));return false}}else{length+=2;}}if(username){if(username.length){length+=Buffer.byteLength(username)+2;}else{stream.emit("error",new Error("Invalid username"));return false}}if(password){if(password.length){length+=byteLength(password)+2;}else{stream.emit("error",new Error("Invalid password"));return false}}stream.write(protocol.CONNECT_HEADER);writeLength(stream,length);writeStringOrBuffer(stream,protocolId);stream.write(protocolVersion===4?protocol.VERSION4:protocol.VERSION3);var flags=0;flags|=username?protocol.USERNAME_MASK:0;flags|=password?protocol.PASSWORD_MASK:0;flags|=will&&will.retain?protocol.WILL_RETAIN_MASK:0;flags|=will&&will.qos?will.qos<<protocol.WILL_QOS_SHIFT:0;flags|=will?protocol.WILL_FLAG_MASK:0;flags|=clean?protocol.CLEAN_SESSION_MASK:0;stream.write(new Buffer([flags]));writeNumber(stream,keepalive);writeStringOrBuffer(stream,clientId);if(will){writeString(stream,will.topic);writeStringOrBuffer(stream,will.payload);}if(username)writeStringOrBuffer(stream,username);if(password)writeStringOrBuffer(stream,password);return true}function connack(opts,stream){var settings=opts||{};var rc=settings.returnCode;if(typeof rc!=="number"){stream.emit("error",new Error("Invalid return code"));return false}stream.write(protocol.CONNACK_HEADER);writeLength(stream,2);stream.write(opts.sessionPresent?protocol.SESSIONPRESENT_HEADER:zeroBuf);return stream.write(new Buffer([rc]))}function publish(opts,stream){var settings=opts||{};var qos=settings.qos||0;var retain=settings.retain?protocol.RETAIN_MASK:0;var topic=settings.topic;var payload=settings.payload||empty;var id=settings.messageId;var length=0;if(typeof topic==="string")length+=Buffer.byteLength(topic)+2;else if(Buffer.isBuffer(topic))length+=topic.length+2;else{stream.emit("error",new Error("Invalid topic"));return false}if(!Buffer.isBuffer(payload))length+=Buffer.byteLength(payload);else length+=payload.length;if(qos&&typeof id!=="number"){stream.emit("error",new Error("Invalid message id"));return false}else if(qos)length+=2;stream.write(protocol.PUBLISH_HEADER[qos][opts.dup?1:0][retain?1:0]);writeLength(stream,length);writeNumber(stream,byteLength(topic));stream.write(topic);if(qos>0)writeNumber(stream,id);return stream.write(payload)}function confirmation(opts,stream){var settings=opts||{};var type=settings.cmd||"puback";var id=settings.messageId;var dup=settings.dup&&type==="pubrel"?protocol.DUP_MASK:0;var qos=0;if(type==="pubrel")qos=1;if(typeof id!=="number"){stream.emit("error",new Error("Invalid message id"));return false}stream.write(protocol.ACKS[type][qos][dup][0]);writeLength(stream,2);return writeNumber(stream,id)}function subscribe(opts,stream){var settings=opts||{};var dup=settings.dup?protocol.DUP_MASK:0;var id=settings.messageId;var subs=settings.subscriptions;var length=0;if(typeof id!=="number"){stream.emit("error",new Error("Invalid message id"));return false}else length+=2;if(typeof subs==="object"&&subs.length){for(var i=0;i<subs.length;i+=1){var itopic=subs[i].topic;var iqos=subs[i].qos;if(typeof itopic!=="string"){stream.emit("error",new Error("Invalid subscriptions - invalid topic"));return false}if(typeof iqos!=="number"){stream.emit("error",new Error("Invalid subscriptions - invalid qos"));return false}length+=Buffer.byteLength(itopic)+2+1;}}else{stream.emit("error",new Error("Invalid subscriptions"));return false}stream.write(protocol.SUBSCRIBE_HEADER[1][dup?1:0][0]);writeLength(stream,length);writeNumber(stream,id);var result=true;for(var j=0;j<subs.length;j++){var sub=subs[j];var jtopic=sub.topic;var jqos=sub.qos;writeString(stream,jtopic);result=stream.write(protocol.QOS[jqos]);}return result}function suback(opts,stream){var settings=opts||{};var id=settings.messageId;var granted=settings.granted;var length=0;if(typeof id!=="number"){stream.emit("error",new Error("Invalid message id"));return false}else length+=2;if(typeof granted==="object"&&granted.length){for(var i=0;i<granted.length;i+=1){if(typeof granted[i]!=="number"){stream.emit("error",new Error("Invalid qos vector"));return false}length+=1;}}else{stream.emit("error",new Error("Invalid qos vector"));return false}stream.write(protocol.SUBACK_HEADER);writeLength(stream,length);writeNumber(stream,id);return stream.write(new Buffer(granted))}function unsubscribe(opts,stream){var settings=opts||{};var id=settings.messageId;var dup=settings.dup?protocol.DUP_MASK:0;var unsubs=settings.unsubscriptions;var length=0;if(typeof id!=="number"){stream.emit("error",new Error("Invalid message id"));return false}else{length+=2;}if(typeof unsubs==="object"&&unsubs.length){for(var i=0;i<unsubs.length;i+=1){if(typeof unsubs[i]!=="string"){stream.emit("error",new Error("Invalid unsubscriptions"));return false}length+=Buffer.byteLength(unsubs[i])+2;}}else{stream.emit("error",new Error("Invalid unsubscriptions"));return false}stream.write(protocol.UNSUBSCRIBE_HEADER[1][dup?1:0][0]);writeLength(stream,length);writeNumber(stream,id);var result=true;for(var j=0;j<unsubs.length;j++){result=writeString(stream,unsubs[j]);}return result}function emptyPacket(opts,stream){return stream.write(protocol.EMPTY[opts.cmd])}function calcLengthLength(length){if(length>=0&&length<128)return 1;else if(length>=128&&length<16384)return 2;else if(length>=16384&&length<2097152)return 3;else if(length>=2097152&&length<268435456)return 4;else return 0;
}function genBufLength(length){var digit=0;var pos=0;var buffer=new Buffer(calcLengthLength(length));do{digit=length%128|0;length=length/128|0;if(length>0)digit=digit|128;buffer.writeUInt8(digit,pos++,true);}while(length>0);return buffer}var lengthCache={};function writeLength(stream,length){var buffer=lengthCache[length];if(!buffer){buffer=genBufLength(length);if(length<16384)lengthCache[length]=buffer;}stream.write(buffer);}function writeString(stream,string){var strlen=Buffer.byteLength(string);writeNumber(stream,strlen);stream.write(string,"utf8");}function writeNumber(stream,number){return stream.write(numCache[number])}function writeStringOrBuffer(stream,toWrite){if(toWrite&&typeof toWrite==="string")writeString(stream,toWrite);else if(toWrite){writeNumber(stream,toWrite.length);stream.write(toWrite);}else writeNumber(stream,0);}function byteLength(bufOrString){if(!bufOrString)return 0;else if(Buffer.isBuffer(bufOrString))return bufOrString.length;else return Buffer.byteLength(bufOrString)}module.exports=generate;}).call(this,require("buffer").Buffer);},{"./constants":22,"./numbers":25,buffer:11,"process-nextick-args":30}],29:[function(require,module,exports){var wrappy=require("wrappy");module.exports=wrappy(once);once.proto=once(function(){Object.defineProperty(Function.prototype,"once",{value:function(){return once(this)},configurable:true});});function once(fn){var f=function(){if(f.called)return f.value;f.called=true;return f.value=fn.apply(this,arguments)};f.called=false;return f}},{wrappy:57}],30:[function(require,module,exports){(function(process){"use strict";if(!process.version||process.version.indexOf("v0.")===0||process.version.indexOf("v1.")===0&&process.version.indexOf("v1.8.")!==0){module.exports=nextTick;}else{module.exports=process.nextTick;}function nextTick(fn,arg1,arg2,arg3){if(typeof fn!=="function"){throw new TypeError('"callback" argument must be a function')}var len=arguments.length;var args,i;switch(len){case 0:case 1:return process.nextTick(fn);case 2:return process.nextTick(function afterTickOne(){fn.call(null,arg1);});case 3:return process.nextTick(function afterTickTwo(){fn.call(null,arg1,arg2);});case 4:return process.nextTick(function afterTickThree(){fn.call(null,arg1,arg2,arg3);});default:args=new Array(len-1);i=0;while(i<args.length){args[i++]=arguments[i];}return process.nextTick(function afterTick(){fn.apply(null,args);})}}}).call(this,require("_process"));},{_process:31}],31:[function(require,module,exports){var process=module.exports={};var cachedSetTimeout;var cachedClearTimeout;function defaultSetTimout(){throw new Error("setTimeout has not been defined")}function defaultClearTimeout(){throw new Error("clearTimeout has not been defined")}(function(){try{if(typeof setTimeout==="function"){cachedSetTimeout=setTimeout;}else{cachedSetTimeout=defaultSetTimout;}}catch(e){cachedSetTimeout=defaultSetTimout;}try{if(typeof clearTimeout==="function"){cachedClearTimeout=clearTimeout;}else{cachedClearTimeout=defaultClearTimeout;}}catch(e){cachedClearTimeout=defaultClearTimeout;}})();function runTimeout(fun){if(cachedSetTimeout===setTimeout){return setTimeout(fun,0)}if((cachedSetTimeout===defaultSetTimout||!cachedSetTimeout)&&setTimeout){cachedSetTimeout=setTimeout;return setTimeout(fun,0)}try{return cachedSetTimeout(fun,0)}catch(e){try{return cachedSetTimeout.call(null,fun,0)}catch(e){return cachedSetTimeout.call(this,fun,0)}}}function runClearTimeout(marker){if(cachedClearTimeout===clearTimeout){return clearTimeout(marker)}if((cachedClearTimeout===defaultClearTimeout||!cachedClearTimeout)&&clearTimeout){cachedClearTimeout=clearTimeout;return clearTimeout(marker)}try{return cachedClearTimeout(marker)}catch(e){try{return cachedClearTimeout.call(null,marker)}catch(e){return cachedClearTimeout.call(this,marker)}}}var queue=[];var draining=false;var currentQueue;var queueIndex=-1;function cleanUpNextTick(){if(!draining||!currentQueue){return}draining=false;if(currentQueue.length){queue=currentQueue.concat(queue);}else{queueIndex=-1;}if(queue.length){drainQueue();}}function drainQueue(){if(draining){return}var timeout=runTimeout(cleanUpNextTick);draining=true;var len=queue.length;while(len){currentQueue=queue;queue=[];while(++queueIndex<len){if(currentQueue){currentQueue[queueIndex].run();}}queueIndex=-1;len=queue.length;}currentQueue=null;draining=false;runClearTimeout(timeout);}process.nextTick=function(fun){var args=new Array(arguments.length-1);if(arguments.length>1){for(var i=1;i<arguments.length;i++){args[i-1]=arguments[i];}}queue.push(new Item(fun,args));if(queue.length===1&&!draining){runTimeout(drainQueue);}};function Item(fun,array){this.fun=fun;this.array=array;}Item.prototype.run=function(){this.fun.apply(null,this.array);};process.title="browser";process.browser=true;process.env={};process.argv=[];process.version="";process.versions={};function noop(){}process.on=noop;process.addListener=noop;process.once=noop;process.off=noop;process.removeListener=noop;process.removeAllListeners=noop;process.emit=noop;process.binding=function(name){throw new Error("process.binding is not supported")};process.cwd=function(){return"/"};process.chdir=function(dir){throw new Error("process.chdir is not supported")};process.umask=function(){return 0};},{}],32:[function(require,module,exports){(function(global){(function(root){var freeExports=typeof exports=="object"&&exports&&!exports.nodeType&&exports;var freeModule=typeof module=="object"&&module&&!module.nodeType&&module;var freeGlobal=typeof global=="object"&&global;if(freeGlobal.global===freeGlobal||freeGlobal.window===freeGlobal||freeGlobal.self===freeGlobal){root=freeGlobal;}var punycode,maxInt=2147483647,base=36,tMin=1,tMax=26,skew=38,damp=700,initialBias=72,initialN=128,delimiter="-",regexPunycode=/^xn--/,regexNonASCII=/[^\x20-\x7E]/,regexSeparators=/[\x2E\u3002\uFF0E\uFF61]/g,errors={overflow:"Overflow: input needs wider integers to process","not-basic":"Illegal input >= 0x80 (not a basic code point)","invalid-input":"Invalid input"},baseMinusTMin=base-tMin,floor=Math.floor,stringFromCharCode=String.fromCharCode,key;function error(type){throw new RangeError(errors[type])}function map(array,fn){var length=array.length;var result=[];while(length--){result[length]=fn(array[length]);}return result}function mapDomain(string,fn){var parts=string.split("@");var result="";if(parts.length>1){result=parts[0]+"@";string=parts[1];}string=string.replace(regexSeparators,".");var labels=string.split(".");var encoded=map(labels,fn).join(".");return result+encoded}function ucs2decode(string){var output=[],counter=0,length=string.length,value,extra;while(counter<length){value=string.charCodeAt(counter++);if(value>=55296&&value<=56319&&counter<length){extra=string.charCodeAt(counter++);if((extra&64512)==56320){output.push(((value&1023)<<10)+(extra&1023)+65536);}else{output.push(value);counter--;}}else{output.push(value);}}return output}function ucs2encode(array){return map(array,function(value){var output="";if(value>65535){value-=65536;output+=stringFromCharCode(value>>>10&1023|55296);value=56320|value&1023;}output+=stringFromCharCode(value);return output}).join("")}function basicToDigit(codePoint){if(codePoint-48<10){return codePoint-22}if(codePoint-65<26){return codePoint-65}if(codePoint-97<26){return codePoint-97}return base}function digitToBasic(digit,flag){return digit+22+75*(digit<26)-((flag!=0)<<5)}function adapt(delta,numPoints,firstTime){var k=0;delta=firstTime?floor(delta/damp):delta>>1;delta+=floor(delta/numPoints);for(;delta>baseMinusTMin*tMax>>1;k+=base){delta=floor(delta/baseMinusTMin);}return floor(k+(baseMinusTMin+1)*delta/(delta+skew))}function decode(input){var output=[],inputLength=input.length,out,i=0,n=initialN,bias=initialBias,basic,j,index,oldi,w,k,digit,t,baseMinusT;basic=input.lastIndexOf(delimiter);if(basic<0){basic=0;}for(j=0;j<basic;++j){if(input.charCodeAt(j)>=128){error("not-basic");}output.push(input.charCodeAt(j));}for(index=basic>0?basic+1:0;index<inputLength;){for(oldi=i,w=1,k=base;;k+=base){if(index>=inputLength){error("invalid-input");}digit=basicToDigit(input.charCodeAt(index++));if(digit>=base||digit>floor((maxInt-i)/w)){error("overflow");}i+=digit*w;t=k<=bias?tMin:k>=bias+tMax?tMax:k-bias;if(digit<t){break}baseMinusT=base-t;if(w>floor(maxInt/baseMinusT)){error("overflow");}w*=baseMinusT;}out=output.length+1;bias=adapt(i-oldi,out,oldi==0);if(floor(i/out)>maxInt-n){error("overflow");}n+=floor(i/out);i%=out;output.splice(i++,0,n);}return ucs2encode(output)}function encode(input){var n,delta,handledCPCount,basicLength,bias,j,m,q,k,t,currentValue,output=[],inputLength,handledCPCountPlusOne,baseMinusT,qMinusT;input=ucs2decode(input);inputLength=input.length;n=initialN;delta=0;bias=initialBias;for(j=0;j<inputLength;++j){currentValue=input[j];if(currentValue<128){output.push(stringFromCharCode(currentValue));}}handledCPCount=basicLength=output.length;if(basicLength){output.push(delimiter);}while(handledCPCount<inputLength){for(m=maxInt,j=0;j<inputLength;++j){currentValue=input[j];if(currentValue>=n&&currentValue<m){m=currentValue;}}handledCPCountPlusOne=handledCPCount+1;if(m-n>floor((maxInt-delta)/handledCPCountPlusOne)){error("overflow");}delta+=(m-n)*handledCPCountPlusOne;n=m;for(j=0;j<inputLength;++j){currentValue=input[j];if(currentValue<n&&++delta>maxInt){error("overflow");}if(currentValue==n){for(q=delta,k=base;;k+=base){t=k<=bias?tMin:k>=bias+tMax?tMax:k-bias;if(q<t){break}qMinusT=q-t;baseMinusT=base-t;output.push(stringFromCharCode(digitToBasic(t+qMinusT%baseMinusT,0)));q=floor(qMinusT/baseMinusT);}output.push(stringFromCharCode(digitToBasic(q,0)));bias=adapt(delta,handledCPCountPlusOne,handledCPCount==basicLength);delta=0;++handledCPCount;}}++delta;++n;}return output.join("")}function toUnicode(input){return mapDomain(input,function(string){return regexPunycode.test(string)?decode(string.slice(4).toLowerCase()):string})}function toASCII(input){return mapDomain(input,function(string){return regexNonASCII.test(string)?"xn--"+encode(string):string})}punycode={version:"1.4.1",ucs2:{decode:ucs2decode,encode:ucs2encode},decode:decode,encode:encode,toASCII:toASCII,toUnicode:toUnicode};if(typeof define=="function"&&typeof define.amd=="object"&&define.amd){define("punycode",function(){return punycode});}else if(freeExports&&freeModule){if(module.exports==freeExports){freeModule.exports=punycode;}else{for(key in punycode){punycode.hasOwnProperty(key)&&(freeExports[key]=punycode[key]);}}}else{root.punycode=punycode;}})(this);}).call(this,typeof commonjsGlobal!=="undefined"?commonjsGlobal:typeof self!=="undefined"?self:typeof window!=="undefined"?window:{});},{}],33:[function(require,module,exports){"use strict";function hasOwnProperty(obj,prop){return Object.prototype.hasOwnProperty.call(obj,prop)}module.exports=function(qs,sep,eq,options){sep=sep||"&";eq=eq||"=";var obj={};if(typeof qs!=="string"||qs.length===0){return obj}var regexp=/\+/g;qs=qs.split(sep);var maxKeys=1e3;if(options&&typeof options.maxKeys==="number"){maxKeys=options.maxKeys;}var len=qs.length;if(maxKeys>0&&len>maxKeys){len=maxKeys;}for(var i=0;i<len;++i){var x=qs[i].replace(regexp,"%20"),idx=x.indexOf(eq),kstr,vstr,k,v;if(idx>=0){kstr=x.substr(0,idx);vstr=x.substr(idx+1);}else{kstr=x;vstr="";}k=decodeURIComponent(kstr);v=decodeURIComponent(vstr);if(!hasOwnProperty(obj,k)){obj[k]=v;}else if(isArray(obj[k])){obj[k].push(v);}else{obj[k]=[obj[k],v];}}return obj};var isArray=Array.isArray||function(xs){return Object.prototype.toString.call(xs)==="[object Array]"};},{}],34:[function(require,module,exports){"use strict";var stringifyPrimitive=function(v){switch(typeof v){case"string":return v;case"boolean":return v?"true":"false";case"number":return isFinite(v)?v:"";default:return""}};module.exports=function(obj,sep,eq,name){sep=sep||"&";eq=eq||"=";if(obj===null){obj=undefined;}if(typeof obj==="object"){return map(objectKeys(obj),function(k){var ks=encodeURIComponent(stringifyPrimitive(k))+eq;if(isArray(obj[k])){return map(obj[k],function(v){return ks+encodeURIComponent(stringifyPrimitive(v))}).join(sep)}else{return ks+encodeURIComponent(stringifyPrimitive(obj[k]))}}).join(sep)}if(!name)return"";return encodeURIComponent(stringifyPrimitive(name))+eq+encodeURIComponent(stringifyPrimitive(obj))};var isArray=Array.isArray||function(xs){return Object.prototype.toString.call(xs)==="[object Array]"};function map(xs,f){if(xs.map)return xs.map(f);var res=[];for(var i=0;i<xs.length;i++){res.push(f(xs[i],i));}return res}var objectKeys=Object.keys||function(obj){var res=[];for(var key in obj){if(Object.prototype.hasOwnProperty.call(obj,key))res.push(key);}return res};},{}],35:[function(require,module,exports){"use strict";exports.decode=exports.parse=require("./decode");exports.encode=exports.stringify=require("./encode");},{"./decode":33,"./encode":34}],36:[function(require,module,exports){module.exports=require("./lib/_stream_duplex.js");},{"./lib/_stream_duplex.js":37}],37:[function(require,module,exports){"use strict";var objectKeys=Object.keys||function(obj){var keys=[];for(var key in obj){keys.push(key);}return keys};module.exports=Duplex;var processNextTick=require("process-nextick-args");var util=require("core-util-is");util.inherits=require("inherits");var Readable=require("./_stream_readable");var Writable=require("./_stream_writable");util.inherits(Duplex,Readable);var keys=objectKeys(Writable.prototype);for(var v=0;v<keys.length;v++){var method=keys[v];if(!Duplex.prototype[method])Duplex.prototype[method]=Writable.prototype[method];}function Duplex(options){if(!(this instanceof Duplex))return new Duplex(options);Readable.call(this,options);Writable.call(this,options);if(options&&options.readable===false)this.readable=false;if(options&&options.writable===false)this.writable=false;this.allowHalfOpen=true;if(options&&options.allowHalfOpen===false)this.allowHalfOpen=false;this.once("end",onend);}function onend(){if(this.allowHalfOpen||this._writableState.ended)return;processNextTick(onEndNT,this);}function onEndNT(self){self.end();}},{"./_stream_readable":39,"./_stream_writable":41,"core-util-is":13,inherits:19,"process-nextick-args":30}],38:[function(require,module,exports){"use strict";module.exports=PassThrough;var Transform=require("./_stream_transform");var util=require("core-util-is");util.inherits=require("inherits");util.inherits(PassThrough,Transform);function PassThrough(options){if(!(this instanceof PassThrough))return new PassThrough(options);Transform.call(this,options);}PassThrough.prototype._transform=function(chunk,encoding,cb){cb(null,chunk);};},{"./_stream_transform":40,"core-util-is":13,inherits:19}],39:[function(require,module,exports){(function(process){"use strict";module.exports=Readable;var processNextTick=require("process-nextick-args");var isArray=require("isarray");var Duplex;Readable.ReadableState=ReadableState;var EE=require("events").EventEmitter;var EElistenerCount=function(emitter,type){return emitter.listeners(type).length};var Stream;(function(){try{Stream=require("st"+"ream");}catch(_){}finally{if(!Stream)Stream=require("events").EventEmitter;}})();var Buffer=require("buffer").Buffer;var bufferShim=require("buffer-shims");var util=require("core-util-is");util.inherits=require("inherits");var debugUtil=require("util");var debug=void 0;if(debugUtil&&debugUtil.debuglog){debug=debugUtil.debuglog("stream");}else{debug=function(){};}var BufferList=require("./internal/streams/BufferList");var StringDecoder;util.inherits(Readable,Stream);function prependListener(emitter,event,fn){if(typeof emitter.prependListener==="function"){return emitter.prependListener(event,fn)}else{if(!emitter._events||!emitter._events[event])emitter.on(event,fn);else if(isArray(emitter._events[event]))emitter._events[event].unshift(fn);else emitter._events[event]=[fn,emitter._events[event]];}}function ReadableState(options,stream){Duplex=Duplex||require("./_stream_duplex");options=options||{};this.objectMode=!!options.objectMode;if(stream instanceof Duplex)this.objectMode=this.objectMode||!!options.readableObjectMode;var hwm=options.highWaterMark;var defaultHwm=this.objectMode?16:16*1024;this.highWaterMark=hwm||hwm===0?hwm:defaultHwm;this.highWaterMark=~~this.highWaterMark;this.buffer=new BufferList;this.length=0;this.pipes=null;this.pipesCount=0;this.flowing=null;this.ended=false;this.endEmitted=false;this.reading=false;this.sync=true;this.needReadable=false;this.emittedReadable=false;this.readableListening=false;this.resumeScheduled=false;this.defaultEncoding=options.defaultEncoding||"utf8";this.ranOut=false;this.awaitDrain=0;this.readingMore=false;this.decoder=null;this.encoding=null;if(options.encoding){if(!StringDecoder)StringDecoder=require("string_decoder/").StringDecoder;this.decoder=new StringDecoder(options.encoding);this.encoding=options.encoding;}}function Readable(options){Duplex=Duplex||require("./_stream_duplex");if(!(this instanceof Readable))return new Readable(options);this._readableState=new ReadableState(options,this);this.readable=true;if(options&&typeof options.read==="function")this._read=options.read;Stream.call(this);}Readable.prototype.push=function(chunk,encoding){var state=this._readableState;if(!state.objectMode&&typeof chunk==="string"){encoding=encoding||state.defaultEncoding;if(encoding!==state.encoding){chunk=bufferShim.from(chunk,encoding);encoding="";}}return readableAddChunk(this,state,chunk,encoding,false)};Readable.prototype.unshift=function(chunk){var state=this._readableState;return readableAddChunk(this,state,chunk,"",true)};Readable.prototype.isPaused=function(){return this._readableState.flowing===false};function readableAddChunk(stream,state,chunk,encoding,addToFront){var er=chunkInvalid(state,chunk);if(er){stream.emit("error",er);}else if(chunk===null){state.reading=false;onEofChunk(stream,state);}else if(state.objectMode||chunk&&chunk.length>0){if(state.ended&&!addToFront){var e=new Error("stream.push() after EOF");stream.emit("error",e);}else if(state.endEmitted&&addToFront){var _e=new Error("stream.unshift() after end event");stream.emit("error",_e);}else{var skipAdd;if(state.decoder&&!addToFront&&!encoding){chunk=state.decoder.write(chunk);skipAdd=!state.objectMode&&chunk.length===0;}if(!addToFront)state.reading=false;if(!skipAdd){if(state.flowing&&state.length===0&&!state.sync){stream.emit("data",chunk);stream.read(0);}else{state.length+=state.objectMode?1:chunk.length;if(addToFront)state.buffer.unshift(chunk);else state.buffer.push(chunk);if(state.needReadable)emitReadable(stream);}}maybeReadMore(stream,state);}}else if(!addToFront){state.reading=false;}return needMoreData(state)}function needMoreData(state){return!state.ended&&(state.needReadable||state.length<state.highWaterMark||state.length===0)}Readable.prototype.setEncoding=function(enc){if(!StringDecoder)StringDecoder=require("string_decoder/").StringDecoder;this._readableState.decoder=new StringDecoder(enc);this._readableState.encoding=enc;return this};var MAX_HWM=8388608;function computeNewHighWaterMark(n){if(n>=MAX_HWM){n=MAX_HWM;}else{n--;n|=n>>>1;n|=n>>>2;n|=n>>>4;n|=n>>>8;n|=n>>>16;n++;}return n}function howMuchToRead(n,state){if(n<=0||state.length===0&&state.ended)return 0;if(state.objectMode)return 1;if(n!==n){if(state.flowing&&state.length)return state.buffer.head.data.length;else return state.length}if(n>state.highWaterMark)state.highWaterMark=computeNewHighWaterMark(n);if(n<=state.length)return n;if(!state.ended){state.needReadable=true;return 0}return state.length}Readable.prototype.read=function(n){debug("read",n);n=parseInt(n,10);var state=this._readableState;var nOrig=n;if(n!==0)state.emittedReadable=false;if(n===0&&state.needReadable&&(state.length>=state.highWaterMark||state.ended)){debug("read: emitReadable",state.length,state.ended);if(state.length===0&&state.ended)endReadable(this);else emitReadable(this);return null}n=howMuchToRead(n,state);if(n===0&&state.ended){if(state.length===0)endReadable(this);return null}var doRead=state.needReadable;debug("need readable",doRead);if(state.length===0||state.length-n<state.highWaterMark){doRead=true;debug("length less than watermark",doRead);}if(state.ended||state.reading){doRead=false;debug("reading or ended",doRead);}else if(doRead){debug("do read");state.reading=true;state.sync=true;if(state.length===0)state.needReadable=true;this._read(state.highWaterMark);state.sync=false;if(!state.reading)n=howMuchToRead(nOrig,state);}var ret;if(n>0)ret=fromList(n,state);else ret=null;if(ret===null){state.needReadable=true;n=0;}else{state.length-=n;}if(state.length===0){if(!state.ended)state.needReadable=true;if(nOrig!==n&&state.ended)endReadable(this);}if(ret!==null)this.emit("data",ret);return ret};function chunkInvalid(state,chunk){var er=null;if(!Buffer.isBuffer(chunk)&&typeof chunk!=="string"&&chunk!==null&&chunk!==undefined&&!state.objectMode){er=new TypeError("Invalid non-string/buffer chunk");}return er}function onEofChunk(stream,state){if(state.ended)return;if(state.decoder){var chunk=state.decoder.end();if(chunk&&chunk.length){state.buffer.push(chunk);state.length+=state.objectMode?1:chunk.length;}}state.ended=true;emitReadable(stream);}function emitReadable(stream){var state=stream._readableState;state.needReadable=false;if(!state.emittedReadable){debug("emitReadable",state.flowing);state.emittedReadable=true;if(state.sync)processNextTick(emitReadable_,stream);else emitReadable_(stream);}}function emitReadable_(stream){debug("emit readable");stream.emit("readable");flow(stream);}function maybeReadMore(stream,state){if(!state.readingMore){state.readingMore=true;processNextTick(maybeReadMore_,stream,state);}}function maybeReadMore_(stream,state){var len=state.length;while(!state.reading&&!state.flowing&&!state.ended&&state.length<state.highWaterMark){debug("maybeReadMore read 0");stream.read(0);if(len===state.length)break;else len=state.length;}state.readingMore=false;}Readable.prototype._read=function(n){this.emit("error",new Error("_read() is not implemented"));};Readable.prototype.pipe=function(dest,pipeOpts){var src=this;var state=this._readableState;switch(state.pipesCount){case 0:state.pipes=dest;break;case 1:state.pipes=[state.pipes,dest];break;default:state.pipes.push(dest);break}state.pipesCount+=1;debug("pipe count=%d opts=%j",state.pipesCount,pipeOpts);var doEnd=(!pipeOpts||pipeOpts.end!==false)&&dest!==process.stdout&&dest!==process.stderr;var endFn=doEnd?onend:cleanup;if(state.endEmitted)processNextTick(endFn);else src.once("end",endFn);dest.on("unpipe",onunpipe);function onunpipe(readable){debug("onunpipe");if(readable===src){cleanup();}}function onend(){debug("onend");dest.end();}var ondrain=pipeOnDrain(src);dest.on("drain",ondrain);var cleanedUp=false;function cleanup(){debug("cleanup");dest.removeListener("close",onclose);dest.removeListener("finish",onfinish);dest.removeListener("drain",ondrain);dest.removeListener("error",onerror);dest.removeListener("unpipe",onunpipe);src.removeListener("end",onend);src.removeListener("end",cleanup);src.removeListener("data",ondata);cleanedUp=true;if(state.awaitDrain&&(!dest._writableState||dest._writableState.needDrain))ondrain();}var increasedAwaitDrain=false;src.on("data",ondata);function ondata(chunk){debug("ondata");increasedAwaitDrain=false;var ret=dest.write(chunk);if(false===ret&&!increasedAwaitDrain){if((state.pipesCount===1&&state.pipes===dest||state.pipesCount>1&&indexOf(state.pipes,dest)!==-1)&&!cleanedUp){debug("false write response, pause",src._readableState.awaitDrain);src._readableState.awaitDrain++;increasedAwaitDrain=true;}src.pause();}}function onerror(er){debug("onerror",er);unpipe();dest.removeListener("error",onerror);if(EElistenerCount(dest,"error")===0)dest.emit("error",er);}prependListener(dest,"error",onerror);function onclose(){dest.removeListener("finish",onfinish);unpipe();}dest.once("close",onclose);function onfinish(){debug("onfinish");dest.removeListener("close",onclose);unpipe();}dest.once("finish",onfinish);function unpipe(){debug("unpipe");src.unpipe(dest);}dest.emit("pipe",src);if(!state.flowing){debug("pipe resume");src.resume();}return dest};function pipeOnDrain(src){return function(){var state=src._readableState;debug("pipeOnDrain",state.awaitDrain);if(state.awaitDrain)state.awaitDrain--;if(state.awaitDrain===0&&EElistenerCount(src,"data")){state.flowing=true;flow(src);}}}Readable.prototype.unpipe=function(dest){var state=this._readableState;if(state.pipesCount===0)return this;if(state.pipesCount===1){if(dest&&dest!==state.pipes)return this;if(!dest)dest=state.pipes;state.pipes=null;state.pipesCount=0;state.flowing=false;if(dest)dest.emit("unpipe",this);return this}if(!dest){var dests=state.pipes;var len=state.pipesCount;state.pipes=null;state.pipesCount=0;state.flowing=false;for(var i=0;i<len;i++){dests[i].emit("unpipe",this);}return this}var index=indexOf(state.pipes,dest);if(index===-1)return this;state.pipes.splice(index,1);state.pipesCount-=1;if(state.pipesCount===1)state.pipes=state.pipes[0];dest.emit("unpipe",this);return this};Readable.prototype.on=function(ev,fn){var res=Stream.prototype.on.call(this,ev,fn);if(ev==="data"){if(this._readableState.flowing!==false)this.resume();}else if(ev==="readable"){var state=this._readableState;if(!state.endEmitted&&!state.readableListening){state.readableListening=state.needReadable=true;state.emittedReadable=false;if(!state.reading){processNextTick(nReadingNextTick,this);}else if(state.length){emitReadable(this,state);}}}return res};Readable.prototype.addListener=Readable.prototype.on;function nReadingNextTick(self){debug("readable nexttick read 0");self.read(0);}Readable.prototype.resume=function(){var state=this._readableState;if(!state.flowing){debug("resume");state.flowing=true;resume(this,state);}return this};function resume(stream,state){if(!state.resumeScheduled){state.resumeScheduled=true;processNextTick(resume_,stream,state);}}function resume_(stream,state){if(!state.reading){debug("resume read 0");stream.read(0);}state.resumeScheduled=false;state.awaitDrain=0;stream.emit("resume");flow(stream);if(state.flowing&&!state.reading)stream.read(0);}Readable.prototype.pause=function(){debug("call pause flowing=%j",this._readableState.flowing);if(false!==this._readableState.flowing){debug("pause");this._readableState.flowing=false;this.emit("pause");}return this};function flow(stream){var state=stream._readableState;debug("flow",state.flowing);while(state.flowing&&stream.read()!==null){}}Readable.prototype.wrap=function(stream){var state=this._readableState;var paused=false;var self=this;stream.on("end",function(){debug("wrapped end");if(state.decoder&&!state.ended){var chunk=state.decoder.end();if(chunk&&chunk.length)self.push(chunk);}self.push(null);});stream.on("data",function(chunk){debug("wrapped data");if(state.decoder)chunk=state.decoder.write(chunk);if(state.objectMode&&(chunk===null||chunk===undefined))return;else if(!state.objectMode&&(!chunk||!chunk.length))return;var ret=self.push(chunk);if(!ret){paused=true;stream.pause();}});for(var i in stream){if(this[i]===undefined&&typeof stream[i]==="function"){this[i]=function(method){return function(){return stream[method].apply(stream,arguments)}}(i);}}var events=["error","close","destroy","pause","resume"];forEach(events,function(ev){stream.on(ev,self.emit.bind(self,ev));});self._read=function(n){debug("wrapped _read",n);if(paused){paused=false;stream.resume();}};return self};Readable._fromList=fromList;function fromList(n,state){if(state.length===0)return null;var ret;if(state.objectMode)ret=state.buffer.shift();else if(!n||n>=state.length){if(state.decoder)ret=state.buffer.join("");else if(state.buffer.length===1)ret=state.buffer.head.data;else ret=state.buffer.concat(state.length);state.buffer.clear();}else{ret=fromListPartial(n,state.buffer,state.decoder);}return ret}function fromListPartial(n,list,hasStrings){var ret;if(n<list.head.data.length){ret=list.head.data.slice(0,n);list.head.data=list.head.data.slice(n);}else if(n===list.head.data.length){ret=list.shift();}else{ret=hasStrings?copyFromBufferString(n,list):copyFromBuffer(n,list);}return ret}function copyFromBufferString(n,list){var p=list.head;var c=1;var ret=p.data;n-=ret.length;while(p=p.next){var str=p.data;var nb=n>str.length?str.length:n;if(nb===str.length)ret+=str;else ret+=str.slice(0,n);n-=nb;if(n===0){if(nb===str.length){++c;if(p.next)list.head=p.next;else list.head=list.tail=null;}else{list.head=p;p.data=str.slice(nb);}break}++c;}list.length-=c;return ret}function copyFromBuffer(n,list){var ret=bufferShim.allocUnsafe(n);var p=list.head;var c=1;p.data.copy(ret);n-=p.data.length;while(p=p.next){var buf=p.data;var nb=n>buf.length?buf.length:n;buf.copy(ret,ret.length-n,0,nb);n-=nb;if(n===0){if(nb===buf.length){++c;if(p.next)list.head=p.next;else list.head=list.tail=null;}else{list.head=p;p.data=buf.slice(nb);}break}++c;}list.length-=c;return ret}function endReadable(stream){var state=stream._readableState;if(state.length>0)throw new Error('"endReadable()" called on non-empty stream');if(!state.endEmitted){state.ended=true;processNextTick(endReadableNT,state,stream);}}function endReadableNT(state,stream){if(!state.endEmitted&&state.length===0){state.endEmitted=true;stream.readable=false;stream.emit("end");}}function forEach(xs,f){for(var i=0,l=xs.length;i<l;i++){f(xs[i],i);}}function indexOf(xs,x){for(var i=0,l=xs.length;i<l;i++){if(xs[i]===x)return i}return-1}}).call(this,require("_process"));},{"./_stream_duplex":37,"./internal/streams/BufferList":42,_process:31,buffer:11,"buffer-shims":12,"core-util-is":13,events:17,inherits:19,isarray:21,"process-nextick-args":30,"string_decoder/":47,util:10}],40:[function(require,module,exports){"use strict";module.exports=Transform;var Duplex=require("./_stream_duplex");var util=require("core-util-is");util.inherits=require("inherits");util.inherits(Transform,Duplex);function TransformState(stream){this.afterTransform=function(er,data){return afterTransform(stream,er,data)};this.needTransform=false;this.transforming=false;this.writecb=null;this.writechunk=null;this.writeencoding=null;}function afterTransform(stream,er,data){var ts=stream._transformState;ts.transforming=false;var cb=ts.writecb;if(!cb)return stream.emit("error",new Error("no writecb in Transform class"));ts.writechunk=null;ts.writecb=null;if(data!==null&&data!==undefined)stream.push(data);cb(er);var rs=stream._readableState;rs.reading=false;if(rs.needReadable||rs.length<rs.highWaterMark){stream._read(rs.highWaterMark);}}function Transform(options){if(!(this instanceof Transform))return new Transform(options);Duplex.call(this,options);this._transformState=new TransformState(this);var stream=this;this._readableState.needReadable=true;this._readableState.sync=false;if(options){if(typeof options.transform==="function")this._transform=options.transform;if(typeof options.flush==="function")this._flush=options.flush;}this.once("prefinish",function(){if(typeof this._flush==="function")this._flush(function(er,data){done(stream,er,data);});else done(stream);});}Transform.prototype.push=function(chunk,encoding){this._transformState.needTransform=false;return Duplex.prototype.push.call(this,chunk,encoding)};Transform.prototype._transform=function(chunk,encoding,cb){throw new Error("_transform() is not implemented")};Transform.prototype._write=function(chunk,encoding,cb){var ts=this._transformState;ts.writecb=cb;ts.writechunk=chunk;ts.writeencoding=encoding;if(!ts.transforming){var rs=this._readableState;if(ts.needTransform||rs.needReadable||rs.length<rs.highWaterMark)this._read(rs.highWaterMark);}};Transform.prototype._read=function(n){var ts=this._transformState;if(ts.writechunk!==null&&ts.writecb&&!ts.transforming){ts.transforming=true;this._transform(ts.writechunk,ts.writeencoding,ts.afterTransform);}else{ts.needTransform=true;}};function done(stream,er,data){if(er)return stream.emit("error",er);if(data!==null&&data!==undefined)stream.push(data);var ws=stream._writableState;var ts=stream._transformState;if(ws.length)throw new Error("Calling transform done when ws.length != 0");if(ts.transforming)throw new Error("Calling transform done when still transforming");
return stream.push(null)}},{"./_stream_duplex":37,"core-util-is":13,inherits:19}],41:[function(require,module,exports){(function(process){"use strict";module.exports=Writable;var processNextTick=require("process-nextick-args");var asyncWrite=!process.browser&&["v0.10","v0.9."].indexOf(process.version.slice(0,5))>-1?setImmediate:processNextTick;var Duplex;Writable.WritableState=WritableState;var util=require("core-util-is");util.inherits=require("inherits");var internalUtil={deprecate:require("util-deprecate")};var Stream;(function(){try{Stream=require("st"+"ream");}catch(_){}finally{if(!Stream)Stream=require("events").EventEmitter;}})();var Buffer=require("buffer").Buffer;var bufferShim=require("buffer-shims");util.inherits(Writable,Stream);function nop(){}function WriteReq(chunk,encoding,cb){this.chunk=chunk;this.encoding=encoding;this.callback=cb;this.next=null;}function WritableState(options,stream){Duplex=Duplex||require("./_stream_duplex");options=options||{};this.objectMode=!!options.objectMode;if(stream instanceof Duplex)this.objectMode=this.objectMode||!!options.writableObjectMode;var hwm=options.highWaterMark;var defaultHwm=this.objectMode?16:16*1024;this.highWaterMark=hwm||hwm===0?hwm:defaultHwm;this.highWaterMark=~~this.highWaterMark;this.needDrain=false;this.ending=false;this.ended=false;this.finished=false;var noDecode=options.decodeStrings===false;this.decodeStrings=!noDecode;this.defaultEncoding=options.defaultEncoding||"utf8";this.length=0;this.writing=false;this.corked=0;this.sync=true;this.bufferProcessing=false;this.onwrite=function(er){onwrite(stream,er);};this.writecb=null;this.writelen=0;this.bufferedRequest=null;this.lastBufferedRequest=null;this.pendingcb=0;this.prefinished=false;this.errorEmitted=false;this.bufferedRequestCount=0;this.corkedRequestsFree=new CorkedRequest(this);}WritableState.prototype.getBuffer=function getBuffer(){var current=this.bufferedRequest;var out=[];while(current){out.push(current);current=current.next;}return out};(function(){try{Object.defineProperty(WritableState.prototype,"buffer",{get:internalUtil.deprecate(function(){return this.getBuffer()},"_writableState.buffer is deprecated. Use _writableState.getBuffer "+"instead.")});}catch(_){}})();var realHasInstance;if(typeof Symbol==="function"&&Symbol.hasInstance&&typeof Function.prototype[Symbol.hasInstance]==="function"){realHasInstance=Function.prototype[Symbol.hasInstance];Object.defineProperty(Writable,Symbol.hasInstance,{value:function(object){if(realHasInstance.call(this,object))return true;return object&&object._writableState instanceof WritableState}});}else{realHasInstance=function(object){return object instanceof this};}function Writable(options){Duplex=Duplex||require("./_stream_duplex");if(!realHasInstance.call(Writable,this)&&!(this instanceof Duplex)){return new Writable(options)}this._writableState=new WritableState(options,this);this.writable=true;if(options){if(typeof options.write==="function")this._write=options.write;if(typeof options.writev==="function")this._writev=options.writev;}Stream.call(this);}Writable.prototype.pipe=function(){this.emit("error",new Error("Cannot pipe, not readable"));};function writeAfterEnd(stream,cb){var er=new Error("write after end");stream.emit("error",er);processNextTick(cb,er);}function validChunk(stream,state,chunk,cb){var valid=true;var er=false;if(chunk===null){er=new TypeError("May not write null values to stream");}else if(!Buffer.isBuffer(chunk)&&typeof chunk!=="string"&&chunk!==undefined&&!state.objectMode){er=new TypeError("Invalid non-string/buffer chunk");}if(er){stream.emit("error",er);processNextTick(cb,er);valid=false;}return valid}Writable.prototype.write=function(chunk,encoding,cb){var state=this._writableState;var ret=false;if(typeof encoding==="function"){cb=encoding;encoding=null;}if(Buffer.isBuffer(chunk))encoding="buffer";else if(!encoding)encoding=state.defaultEncoding;if(typeof cb!=="function")cb=nop;if(state.ended)writeAfterEnd(this,cb);else if(validChunk(this,state,chunk,cb)){state.pendingcb++;ret=writeOrBuffer(this,state,chunk,encoding,cb);}return ret};Writable.prototype.cork=function(){var state=this._writableState;state.corked++;};Writable.prototype.uncork=function(){var state=this._writableState;if(state.corked){state.corked--;if(!state.writing&&!state.corked&&!state.finished&&!state.bufferProcessing&&state.bufferedRequest)clearBuffer(this,state);}};Writable.prototype.setDefaultEncoding=function setDefaultEncoding(encoding){if(typeof encoding==="string")encoding=encoding.toLowerCase();if(!(["hex","utf8","utf-8","ascii","binary","base64","ucs2","ucs-2","utf16le","utf-16le","raw"].indexOf((encoding+"").toLowerCase())>-1))throw new TypeError("Unknown encoding: "+encoding);this._writableState.defaultEncoding=encoding;return this};function decodeChunk(state,chunk,encoding){if(!state.objectMode&&state.decodeStrings!==false&&typeof chunk==="string"){chunk=bufferShim.from(chunk,encoding);}return chunk}function writeOrBuffer(stream,state,chunk,encoding,cb){chunk=decodeChunk(state,chunk,encoding);if(Buffer.isBuffer(chunk))encoding="buffer";var len=state.objectMode?1:chunk.length;state.length+=len;var ret=state.length<state.highWaterMark;if(!ret)state.needDrain=true;if(state.writing||state.corked){var last=state.lastBufferedRequest;state.lastBufferedRequest=new WriteReq(chunk,encoding,cb);if(last){last.next=state.lastBufferedRequest;}else{state.bufferedRequest=state.lastBufferedRequest;}state.bufferedRequestCount+=1;}else{doWrite(stream,state,false,len,chunk,encoding,cb);}return ret}function doWrite(stream,state,writev,len,chunk,encoding,cb){state.writelen=len;state.writecb=cb;state.writing=true;state.sync=true;if(writev)stream._writev(chunk,state.onwrite);else stream._write(chunk,encoding,state.onwrite);state.sync=false;}function onwriteError(stream,state,sync,er,cb){--state.pendingcb;if(sync)processNextTick(cb,er);else cb(er);stream._writableState.errorEmitted=true;stream.emit("error",er);}function onwriteStateUpdate(state){state.writing=false;state.writecb=null;state.length-=state.writelen;state.writelen=0;}function onwrite(stream,er){var state=stream._writableState;var sync=state.sync;var cb=state.writecb;onwriteStateUpdate(state);if(er)onwriteError(stream,state,sync,er,cb);else{var finished=needFinish(state);if(!finished&&!state.corked&&!state.bufferProcessing&&state.bufferedRequest){clearBuffer(stream,state);}if(sync){asyncWrite(afterWrite,stream,state,finished,cb);}else{afterWrite(stream,state,finished,cb);}}}function afterWrite(stream,state,finished,cb){if(!finished)onwriteDrain(stream,state);state.pendingcb--;cb();finishMaybe(stream,state);}function onwriteDrain(stream,state){if(state.length===0&&state.needDrain){state.needDrain=false;stream.emit("drain");}}function clearBuffer(stream,state){state.bufferProcessing=true;var entry=state.bufferedRequest;if(stream._writev&&entry&&entry.next){var l=state.bufferedRequestCount;var buffer=new Array(l);var holder=state.corkedRequestsFree;holder.entry=entry;var count=0;while(entry){buffer[count]=entry;entry=entry.next;count+=1;}doWrite(stream,state,true,state.length,buffer,"",holder.finish);state.pendingcb++;state.lastBufferedRequest=null;if(holder.next){state.corkedRequestsFree=holder.next;holder.next=null;}else{state.corkedRequestsFree=new CorkedRequest(state);}}else{while(entry){var chunk=entry.chunk;var encoding=entry.encoding;var cb=entry.callback;var len=state.objectMode?1:chunk.length;doWrite(stream,state,false,len,chunk,encoding,cb);entry=entry.next;if(state.writing){break}}if(entry===null)state.lastBufferedRequest=null;}state.bufferedRequestCount=0;state.bufferedRequest=entry;state.bufferProcessing=false;}Writable.prototype._write=function(chunk,encoding,cb){cb(new Error("_write() is not implemented"));};Writable.prototype._writev=null;Writable.prototype.end=function(chunk,encoding,cb){var state=this._writableState;if(typeof chunk==="function"){cb=chunk;chunk=null;encoding=null;}else if(typeof encoding==="function"){cb=encoding;encoding=null;}if(chunk!==null&&chunk!==undefined)this.write(chunk,encoding);if(state.corked){state.corked=1;this.uncork();}if(!state.ending&&!state.finished)endWritable(this,state,cb);};function needFinish(state){return state.ending&&state.length===0&&state.bufferedRequest===null&&!state.finished&&!state.writing}function prefinish(stream,state){if(!state.prefinished){state.prefinished=true;stream.emit("prefinish");}}function finishMaybe(stream,state){var need=needFinish(state);if(need){if(state.pendingcb===0){prefinish(stream,state);state.finished=true;stream.emit("finish");}else{prefinish(stream,state);}}return need}function endWritable(stream,state,cb){state.ending=true;finishMaybe(stream,state);if(cb){if(state.finished)processNextTick(cb);else stream.once("finish",cb);}state.ended=true;stream.writable=false;}function CorkedRequest(state){var _this=this;this.next=null;this.entry=null;this.finish=function(err){var entry=_this.entry;_this.entry=null;while(entry){var cb=entry.callback;state.pendingcb--;cb(err);entry=entry.next;}if(state.corkedRequestsFree){state.corkedRequestsFree.next=_this;}else{state.corkedRequestsFree=_this;}};}}).call(this,require("_process"));},{"./_stream_duplex":37,_process:31,buffer:11,"buffer-shims":12,"core-util-is":13,events:17,inherits:19,"process-nextick-args":30,"util-deprecate":51}],42:[function(require,module,exports){"use strict";var Buffer=require("buffer").Buffer;var bufferShim=require("buffer-shims");module.exports=BufferList;function BufferList(){this.head=null;this.tail=null;this.length=0;}BufferList.prototype.push=function(v){var entry={data:v,next:null};if(this.length>0)this.tail.next=entry;else this.head=entry;this.tail=entry;++this.length;};BufferList.prototype.unshift=function(v){var entry={data:v,next:this.head};if(this.length===0)this.tail=entry;this.head=entry;++this.length;};BufferList.prototype.shift=function(){if(this.length===0)return;var ret=this.head.data;if(this.length===1)this.head=this.tail=null;else this.head=this.head.next;--this.length;return ret};BufferList.prototype.clear=function(){this.head=this.tail=null;this.length=0;};BufferList.prototype.join=function(s){if(this.length===0)return"";var p=this.head;var ret=""+p.data;while(p=p.next){ret+=s+p.data;}return ret};BufferList.prototype.concat=function(n){if(this.length===0)return bufferShim.alloc(0);if(this.length===1)return this.head.data;var ret=bufferShim.allocUnsafe(n>>>0);var p=this.head;var i=0;while(p){p.data.copy(ret,i);i+=p.data.length;p=p.next;}return ret};},{buffer:11,"buffer-shims":12}],43:[function(require,module,exports){(function(process){var Stream=function(){try{return require("st"+"ream")}catch(_){}}();exports=module.exports=require("./lib/_stream_readable.js");exports.Stream=Stream||exports;exports.Readable=exports;exports.Writable=require("./lib/_stream_writable.js");exports.Duplex=require("./lib/_stream_duplex.js");exports.Transform=require("./lib/_stream_transform.js");exports.PassThrough=require("./lib/_stream_passthrough.js");if(!process.browser&&process.env.READABLE_STREAM==="disable"&&Stream){module.exports=Stream;}}).call(this,require("_process"));},{"./lib/_stream_duplex.js":37,"./lib/_stream_passthrough.js":38,"./lib/_stream_readable.js":39,"./lib/_stream_transform.js":40,"./lib/_stream_writable.js":41,_process:31}],44:[function(require,module,exports){module.exports=require("./lib/_stream_transform.js");},{"./lib/_stream_transform.js":40}],45:[function(require,module,exports){"use strict";function ReInterval(callback,interval,args){var self=this;this._callback=callback;this._args=args;this._interval=setInterval(callback,interval,this._args);this.reschedule=function(interval){if(!interval)interval=self._interval;if(self._interval)clearInterval(self._interval);self._interval=setInterval(self._callback,interval,self._args);};this.clear=function(){if(self._interval){clearInterval(self._interval);self._interval=undefined;}};this.destroy=function(){if(self._interval){clearInterval(self._interval);}self._callback=undefined;self._interval=undefined;self._args=undefined;};}function reInterval(){if(typeof arguments[0]!=="function")throw new Error("callback needed");if(typeof arguments[1]!=="number")throw new Error("interval needed");var args;if(arguments.length>0){args=new Array(arguments.length-2);for(var i=0;i<args.length;i++){args[i]=arguments[i+2];}}return new ReInterval(arguments[0],arguments[1],args)}module.exports=reInterval;},{}],46:[function(require,module,exports){module.exports=shift;function shift(stream){var rs=stream._readableState;if(!rs)return null;return rs.objectMode?stream.read():stream.read(getStateLength(rs))}function getStateLength(state){if(state.buffer.length){if(state.buffer.head){return state.buffer.head.data.length}return state.buffer[0].length}return state.length}},{}],47:[function(require,module,exports){var Buffer=require("buffer").Buffer;var isBufferEncoding=Buffer.isEncoding||function(encoding){switch(encoding&&encoding.toLowerCase()){case"hex":case"utf8":case"utf-8":case"ascii":case"binary":case"base64":case"ucs2":case"ucs-2":case"utf16le":case"utf-16le":case"raw":return true;default:return false}};function assertEncoding(encoding){if(encoding&&!isBufferEncoding(encoding)){throw new Error("Unknown encoding: "+encoding)}}var StringDecoder=exports.StringDecoder=function(encoding){this.encoding=(encoding||"utf8").toLowerCase().replace(/[-_]/,"");assertEncoding(encoding);switch(this.encoding){case"utf8":this.surrogateSize=3;break;case"ucs2":case"utf16le":this.surrogateSize=2;this.detectIncompleteChar=utf16DetectIncompleteChar;break;case"base64":this.surrogateSize=3;this.detectIncompleteChar=base64DetectIncompleteChar;break;default:this.write=passThroughWrite;return}this.charBuffer=new Buffer(6);this.charReceived=0;this.charLength=0;};StringDecoder.prototype.write=function(buffer){var charStr="";while(this.charLength){var available=buffer.length>=this.charLength-this.charReceived?this.charLength-this.charReceived:buffer.length;buffer.copy(this.charBuffer,this.charReceived,0,available);this.charReceived+=available;if(this.charReceived<this.charLength){return""}buffer=buffer.slice(available,buffer.length);charStr=this.charBuffer.slice(0,this.charLength).toString(this.encoding);var charCode=charStr.charCodeAt(charStr.length-1);if(charCode>=55296&&charCode<=56319){this.charLength+=this.surrogateSize;charStr="";continue}this.charReceived=this.charLength=0;if(buffer.length===0){return charStr}break}this.detectIncompleteChar(buffer);var end=buffer.length;if(this.charLength){buffer.copy(this.charBuffer,0,buffer.length-this.charReceived,end);end-=this.charReceived;}charStr+=buffer.toString(this.encoding,0,end);var end=charStr.length-1;var charCode=charStr.charCodeAt(end);if(charCode>=55296&&charCode<=56319){var size=this.surrogateSize;this.charLength+=size;this.charReceived+=size;this.charBuffer.copy(this.charBuffer,size,0,size);buffer.copy(this.charBuffer,0,0,size);return charStr.substring(0,end)}return charStr};StringDecoder.prototype.detectIncompleteChar=function(buffer){var i=buffer.length>=3?3:buffer.length;for(;i>0;i--){var c=buffer[buffer.length-i];if(i==1&&c>>5==6){this.charLength=2;break}if(i<=2&&c>>4==14){this.charLength=3;break}if(i<=3&&c>>3==30){this.charLength=4;break}}this.charReceived=i;};StringDecoder.prototype.end=function(buffer){var res="";if(buffer&&buffer.length)res=this.write(buffer);if(this.charReceived){var cr=this.charReceived;var buf=this.charBuffer;var enc=this.encoding;res+=buf.slice(0,cr).toString(enc);}return res};function passThroughWrite(buffer){return buffer.toString(this.encoding)}function utf16DetectIncompleteChar(buffer){this.charReceived=buffer.length%2;this.charLength=this.charReceived?2:0;}function base64DetectIncompleteChar(buffer){this.charReceived=buffer.length%3;this.charLength=this.charReceived?3:0;}},{buffer:11}],48:[function(require,module,exports){(function(process){var Transform=require("readable-stream/transform"),inherits=require("util").inherits,xtend=require("xtend");function DestroyableTransform(opts){Transform.call(this,opts);this._destroyed=false;}inherits(DestroyableTransform,Transform);DestroyableTransform.prototype.destroy=function(err){if(this._destroyed)return;this._destroyed=true;var self=this;process.nextTick(function(){if(err)self.emit("error",err);self.emit("close");});};function noop(chunk,enc,callback){callback(null,chunk);}function through2(construct){return function(options,transform,flush){if(typeof options=="function"){flush=transform;transform=options;options={};}if(typeof transform!="function")transform=noop;if(typeof flush!="function")flush=null;return construct(options,transform,flush)}}module.exports=through2(function(options,transform,flush){var t2=new DestroyableTransform(options);t2._transform=transform;if(flush)t2._flush=flush;return t2});module.exports.ctor=through2(function(options,transform,flush){function Through2(override){if(!(this instanceof Through2))return new Through2(override);this.options=xtend(options,override);DestroyableTransform.call(this,this.options);}inherits(Through2,DestroyableTransform);Through2.prototype._transform=transform;if(flush)Through2.prototype._flush=flush;return Through2});module.exports.obj=through2(function(options,transform,flush){var t2=new DestroyableTransform(xtend({objectMode:true,highWaterMark:16},options));t2._transform=transform;if(flush)t2._flush=flush;return t2});}).call(this,require("_process"));},{_process:31,"readable-stream/transform":44,util:54,xtend:58}],49:[function(require,module,exports){"use strict";var punycode=require("punycode");var util=require("./util");exports.parse=urlParse;exports.resolve=urlResolve;exports.resolveObject=urlResolveObject;exports.format=urlFormat;exports.Url=Url;function Url(){this.protocol=null;this.slashes=null;this.auth=null;this.host=null;this.port=null;this.hostname=null;this.hash=null;this.search=null;this.query=null;this.pathname=null;this.path=null;this.href=null;}var protocolPattern=/^([a-z0-9.+-]+:)/i,portPattern=/:[0-9]*$/,simplePathPattern=/^(\/\/?(?!\/)[^\?\s]*)(\?[^\s]*)?$/,delims=["<",">",'"',"`"," ","\r","\n","\t"],unwise=["{","}","|","\\","^","`"].concat(delims),autoEscape=["'"].concat(unwise),nonHostChars=["%","/","?",";","#"].concat(autoEscape),hostEndingChars=["/","?","#"],hostnameMaxLen=255,hostnamePartPattern=/^[+a-z0-9A-Z_-]{0,63}$/,hostnamePartStart=/^([+a-z0-9A-Z_-]{0,63})(.*)$/,unsafeProtocol={javascript:true,"javascript:":true},hostlessProtocol={javascript:true,"javascript:":true},slashedProtocol={http:true,https:true,ftp:true,gopher:true,file:true,"http:":true,"https:":true,"ftp:":true,"gopher:":true,"file:":true},querystring=require("querystring");function urlParse(url,parseQueryString,slashesDenoteHost){if(url&&util.isObject(url)&&url instanceof Url)return url;var u=new Url;u.parse(url,parseQueryString,slashesDenoteHost);return u}Url.prototype.parse=function(url,parseQueryString,slashesDenoteHost){if(!util.isString(url)){throw new TypeError("Parameter 'url' must be a string, not "+typeof url)}var queryIndex=url.indexOf("?"),splitter=queryIndex!==-1&&queryIndex<url.indexOf("#")?"?":"#",uSplit=url.split(splitter),slashRegex=/\\/g;uSplit[0]=uSplit[0].replace(slashRegex,"/");url=uSplit.join(splitter);var rest=url;rest=rest.trim();if(!slashesDenoteHost&&url.split("#").length===1){var simplePath=simplePathPattern.exec(rest);if(simplePath){this.path=rest;this.href=rest;this.pathname=simplePath[1];if(simplePath[2]){this.search=simplePath[2];if(parseQueryString){this.query=querystring.parse(this.search.substr(1));}else{this.query=this.search.substr(1);}}else if(parseQueryString){this.search="";this.query={};}return this}}var proto=protocolPattern.exec(rest);if(proto){proto=proto[0];var lowerProto=proto.toLowerCase();this.protocol=lowerProto;rest=rest.substr(proto.length);}if(slashesDenoteHost||proto||rest.match(/^\/\/[^@\/]+@[^@\/]+/)){var slashes=rest.substr(0,2)==="//";if(slashes&&!(proto&&hostlessProtocol[proto])){rest=rest.substr(2);this.slashes=true;}}if(!hostlessProtocol[proto]&&(slashes||proto&&!slashedProtocol[proto])){var hostEnd=-1;for(var i=0;i<hostEndingChars.length;i++){var hec=rest.indexOf(hostEndingChars[i]);if(hec!==-1&&(hostEnd===-1||hec<hostEnd))hostEnd=hec;}var auth,atSign;if(hostEnd===-1){atSign=rest.lastIndexOf("@");}else{atSign=rest.lastIndexOf("@",hostEnd);}if(atSign!==-1){auth=rest.slice(0,atSign);rest=rest.slice(atSign+1);this.auth=decodeURIComponent(auth);}hostEnd=-1;for(var i=0;i<nonHostChars.length;i++){var hec=rest.indexOf(nonHostChars[i]);if(hec!==-1&&(hostEnd===-1||hec<hostEnd))hostEnd=hec;}if(hostEnd===-1)hostEnd=rest.length;this.host=rest.slice(0,hostEnd);rest=rest.slice(hostEnd);this.parseHost();this.hostname=this.hostname||"";var ipv6Hostname=this.hostname[0]==="["&&this.hostname[this.hostname.length-1]==="]";if(!ipv6Hostname){var hostparts=this.hostname.split(/\./);for(var i=0,l=hostparts.length;i<l;i++){var part=hostparts[i];if(!part)continue;if(!part.match(hostnamePartPattern)){var newpart="";for(var j=0,k=part.length;j<k;j++){if(part.charCodeAt(j)>127){newpart+="x";}else{newpart+=part[j];}}if(!newpart.match(hostnamePartPattern)){var validParts=hostparts.slice(0,i);var notHost=hostparts.slice(i+1);var bit=part.match(hostnamePartStart);if(bit){validParts.push(bit[1]);notHost.unshift(bit[2]);}if(notHost.length){rest="/"+notHost.join(".")+rest;}this.hostname=validParts.join(".");break}}}}if(this.hostname.length>hostnameMaxLen){this.hostname="";}else{this.hostname=this.hostname.toLowerCase();}if(!ipv6Hostname){this.hostname=punycode.toASCII(this.hostname);}var p=this.port?":"+this.port:"";var h=this.hostname||"";this.host=h+p;this.href+=this.host;if(ipv6Hostname){this.hostname=this.hostname.substr(1,this.hostname.length-2);if(rest[0]!=="/"){rest="/"+rest;}}}if(!unsafeProtocol[lowerProto]){for(var i=0,l=autoEscape.length;i<l;i++){var ae=autoEscape[i];if(rest.indexOf(ae)===-1)continue;var esc=encodeURIComponent(ae);if(esc===ae){esc=escape(ae);}rest=rest.split(ae).join(esc);}}var hash=rest.indexOf("#");if(hash!==-1){this.hash=rest.substr(hash);rest=rest.slice(0,hash);}var qm=rest.indexOf("?");if(qm!==-1){this.search=rest.substr(qm);this.query=rest.substr(qm+1);if(parseQueryString){this.query=querystring.parse(this.query);}rest=rest.slice(0,qm);}else if(parseQueryString){this.search="";this.query={};}if(rest)this.pathname=rest;if(slashedProtocol[lowerProto]&&this.hostname&&!this.pathname){this.pathname="/";}if(this.pathname||this.search){var p=this.pathname||"";var s=this.search||"";this.path=p+s;}this.href=this.format();return this};function urlFormat(obj){if(util.isString(obj))obj=urlParse(obj);if(!(obj instanceof Url))return Url.prototype.format.call(obj);return obj.format()}Url.prototype.format=function(){var auth=this.auth||"";if(auth){auth=encodeURIComponent(auth);auth=auth.replace(/%3A/i,":");auth+="@";}var protocol=this.protocol||"",pathname=this.pathname||"",hash=this.hash||"",host=false,query="";if(this.host){host=auth+this.host;}else if(this.hostname){host=auth+(this.hostname.indexOf(":")===-1?this.hostname:"["+this.hostname+"]");if(this.port){host+=":"+this.port;}}if(this.query&&util.isObject(this.query)&&Object.keys(this.query).length){query=querystring.stringify(this.query);}var search=this.search||query&&"?"+query||"";if(protocol&&protocol.substr(-1)!==":")protocol+=":";if(this.slashes||(!protocol||slashedProtocol[protocol])&&host!==false){host="//"+(host||"");if(pathname&&pathname.charAt(0)!=="/")pathname="/"+pathname;}else if(!host){host="";}if(hash&&hash.charAt(0)!=="#")hash="#"+hash;if(search&&search.charAt(0)!=="?")search="?"+search;pathname=pathname.replace(/[?#]/g,function(match){return encodeURIComponent(match)});search=search.replace("#","%23");return protocol+host+pathname+search+hash};function urlResolve(source,relative){return urlParse(source,false,true).resolve(relative)}Url.prototype.resolve=function(relative){return this.resolveObject(urlParse(relative,false,true)).format()};function urlResolveObject(source,relative){if(!source)return relative;return urlParse(source,false,true).resolveObject(relative)}Url.prototype.resolveObject=function(relative){if(util.isString(relative)){var rel=new Url;rel.parse(relative,false,true);relative=rel;}var result=new Url;var tkeys=Object.keys(this);for(var tk=0;tk<tkeys.length;tk++){var tkey=tkeys[tk];result[tkey]=this[tkey];}result.hash=relative.hash;if(relative.href===""){result.href=result.format();return result}if(relative.slashes&&!relative.protocol){var rkeys=Object.keys(relative);for(var rk=0;rk<rkeys.length;rk++){var rkey=rkeys[rk];if(rkey!=="protocol")result[rkey]=relative[rkey];}if(slashedProtocol[result.protocol]&&result.hostname&&!result.pathname){result.path=result.pathname="/";}result.href=result.format();return result}if(relative.protocol&&relative.protocol!==result.protocol){if(!slashedProtocol[relative.protocol]){var keys=Object.keys(relative);for(var v=0;v<keys.length;v++){var k=keys[v];result[k]=relative[k];}result.href=result.format();return result}result.protocol=relative.protocol;if(!relative.host&&!hostlessProtocol[relative.protocol]){var relPath=(relative.pathname||"").split("/");while(relPath.length&&!(relative.host=relPath.shift()));if(!relative.host)relative.host="";if(!relative.hostname)relative.hostname="";if(relPath[0]!=="")relPath.unshift("");if(relPath.length<2)relPath.unshift("");result.pathname=relPath.join("/");}else{result.pathname=relative.pathname;}result.search=relative.search;result.query=relative.query;result.host=relative.host||"";result.auth=relative.auth;result.hostname=relative.hostname||relative.host;result.port=relative.port;if(result.pathname||result.search){var p=result.pathname||"";var s=result.search||"";result.path=p+s;}result.slashes=result.slashes||relative.slashes;result.href=result.format();return result}var isSourceAbs=result.pathname&&result.pathname.charAt(0)==="/",isRelAbs=relative.host||relative.pathname&&relative.pathname.charAt(0)==="/",mustEndAbs=isRelAbs||isSourceAbs||result.host&&relative.pathname,removeAllDots=mustEndAbs,srcPath=result.pathname&&result.pathname.split("/")||[],relPath=relative.pathname&&relative.pathname.split("/")||[],psychotic=result.protocol&&!slashedProtocol[result.protocol];if(psychotic){result.hostname="";result.port=null;if(result.host){if(srcPath[0]==="")srcPath[0]=result.host;else srcPath.unshift(result.host);}result.host="";if(relative.protocol){relative.hostname=null;relative.port=null;if(relative.host){if(relPath[0]==="")relPath[0]=relative.host;else relPath.unshift(relative.host);}relative.host=null;}mustEndAbs=mustEndAbs&&(relPath[0]===""||srcPath[0]==="");}if(isRelAbs){result.host=relative.host||relative.host===""?relative.host:result.host;result.hostname=relative.hostname||relative.hostname===""?relative.hostname:result.hostname;result.search=relative.search;result.query=relative.query;srcPath=relPath;}else if(relPath.length){if(!srcPath)srcPath=[];srcPath.pop();srcPath=srcPath.concat(relPath);result.search=relative.search;result.query=relative.query;}else if(!util.isNullOrUndefined(relative.search)){if(psychotic){result.hostname=result.host=srcPath.shift();var authInHost=result.host&&result.host.indexOf("@")>0?result.host.split("@"):false;if(authInHost){result.auth=authInHost.shift();result.host=result.hostname=authInHost.shift();}}result.search=relative.search;result.query=relative.query;if(!util.isNull(result.pathname)||!util.isNull(result.search)){result.path=(result.pathname?result.pathname:"")+(result.search?result.search:"");}result.href=result.format();return result}if(!srcPath.length){result.pathname=null;if(result.search){result.path="/"+result.search;}else{result.path=null;}result.href=result.format();return result}var last=srcPath.slice(-1)[0];var hasTrailingSlash=(result.host||relative.host||srcPath.length>1)&&(last==="."||last==="..")||last==="";var up=0;for(var i=srcPath.length;i>=0;i--){last=srcPath[i];if(last==="."){srcPath.splice(i,1);}else if(last===".."){srcPath.splice(i,1);up++;}else if(up){srcPath.splice(i,1);up--;}}if(!mustEndAbs&&!removeAllDots){for(;up--;up){srcPath.unshift("..");}}if(mustEndAbs&&srcPath[0]!==""&&(!srcPath[0]||srcPath[0].charAt(0)!=="/")){srcPath.unshift("");}if(hasTrailingSlash&&srcPath.join("/").substr(-1)!=="/"){srcPath.push("");}var isAbsolute=srcPath[0]===""||srcPath[0]&&srcPath[0].charAt(0)==="/";if(psychotic){result.hostname=result.host=isAbsolute?"":srcPath.length?srcPath.shift():"";var authInHost=result.host&&result.host.indexOf("@")>0?result.host.split("@"):false;if(authInHost){result.auth=authInHost.shift();result.host=result.hostname=authInHost.shift();}}mustEndAbs=mustEndAbs||result.host&&srcPath.length;if(mustEndAbs&&!isAbsolute){srcPath.unshift("");}if(!srcPath.length){result.pathname=null;result.path=null;}else{result.pathname=srcPath.join("/");}if(!util.isNull(result.pathname)||!util.isNull(result.search)){result.path=(result.pathname?result.pathname:"")+(result.search?result.search:"");}result.auth=relative.auth||result.auth;result.slashes=result.slashes||relative.slashes;result.href=result.format();return result};Url.prototype.parseHost=function(){var host=this.host;var port=portPattern.exec(host);if(port){port=port[0];if(port!==":"){this.port=port.substr(1);}host=host.substr(0,host.length-port.length);}if(host)this.hostname=host;};},{"./util":50,punycode:32,querystring:35}],50:[function(require,module,exports){"use strict";module.exports={isString:function(arg){return typeof arg==="string"},isObject:function(arg){return typeof arg==="object"&&arg!==null},isNull:function(arg){return arg===null},isNullOrUndefined:function(arg){return arg==null}};},{}],51:[function(require,module,exports){(function(global){module.exports=deprecate;function deprecate(fn,msg){if(config("noDeprecation")){return fn}var warned=false;function deprecated(){if(!warned){if(config("throwDeprecation")){throw new Error(msg)}else if(config("traceDeprecation")){console.trace(msg);}else{console.warn(msg);}warned=true;}return fn.apply(this,arguments)}return deprecated}function config(name){try{if(!global.localStorage)return false}catch(_){return false}var val=global.localStorage[name];if(null==val)return false;return String(val).toLowerCase()==="true"}}).call(this,typeof commonjsGlobal!=="undefined"?commonjsGlobal:typeof self!=="undefined"?self:typeof window!=="undefined"?window:{});},{}],52:[function(require,module,exports){arguments[4][19][0].apply(exports,arguments);},{dup:19}],53:[function(require,module,exports){module.exports=function isBuffer(arg){return arg&&typeof arg==="object"&&typeof arg.copy==="function"&&typeof arg.fill==="function"&&typeof arg.readUInt8==="function"};},{}],54:[function(require,module,exports){(function(process,global){var formatRegExp=/%[sdj%]/g;exports.format=function(f){if(!isString(f)){var objects=[];for(var i=0;i<arguments.length;i++){objects.push(inspect(arguments[i]));}return objects.join(" ")}var i=1;var args=arguments;var len=args.length;var str=String(f).replace(formatRegExp,function(x){if(x==="%%")return"%";if(i>=len)return x;switch(x){case"%s":return String(args[i++]);case"%d":return Number(args[i++]);case"%j":try{return JSON.stringify(args[i++])}catch(_){return"[Circular]"}default:return x}});for(var x=args[i];i<len;x=args[++i]){if(isNull(x)||!isObject(x)){str+=" "+x;}else{str+=" "+inspect(x);}}return str};exports.deprecate=function(fn,msg){if(isUndefined(global.process)){return function(){return exports.deprecate(fn,msg).apply(this,arguments)}}if(process.noDeprecation===true){return fn}var warned=false;function deprecated(){if(!warned){if(process.throwDeprecation){throw new Error(msg)}else if(process.traceDeprecation){console.trace(msg);}else{console.error(msg);}warned=true;}return fn.apply(this,arguments)}return deprecated};var debugs={};var debugEnviron;exports.debuglog=function(set){if(isUndefined(debugEnviron))debugEnviron=process.env.NODE_DEBUG||"";set=set.toUpperCase();if(!debugs[set]){if(new RegExp("\\b"+set+"\\b","i").test(debugEnviron)){var pid=process.pid;debugs[set]=function(){var msg=exports.format.apply(exports,arguments);console.error("%s %d: %s",set,pid,msg);};}else{debugs[set]=function(){};}}return debugs[set];
};function inspect(obj,opts){var ctx={seen:[],stylize:stylizeNoColor};if(arguments.length>=3)ctx.depth=arguments[2];if(arguments.length>=4)ctx.colors=arguments[3];if(isBoolean(opts)){ctx.showHidden=opts;}else if(opts){exports._extend(ctx,opts);}if(isUndefined(ctx.showHidden))ctx.showHidden=false;if(isUndefined(ctx.depth))ctx.depth=2;if(isUndefined(ctx.colors))ctx.colors=false;if(isUndefined(ctx.customInspect))ctx.customInspect=true;if(ctx.colors)ctx.stylize=stylizeWithColor;return formatValue(ctx,obj,ctx.depth)}exports.inspect=inspect;inspect.colors={bold:[1,22],italic:[3,23],underline:[4,24],inverse:[7,27],white:[37,39],grey:[90,39],black:[30,39],blue:[34,39],cyan:[36,39],green:[32,39],magenta:[35,39],red:[31,39],yellow:[33,39]};inspect.styles={special:"cyan",number:"yellow",boolean:"yellow",undefined:"grey",null:"bold",string:"green",date:"magenta",regexp:"red"};function stylizeWithColor(str,styleType){var style=inspect.styles[styleType];if(style){return"["+inspect.colors[style][0]+"m"+str+"["+inspect.colors[style][1]+"m"}else{return str}}function stylizeNoColor(str,styleType){return str}function arrayToHash(array){var hash={};array.forEach(function(val,idx){hash[val]=true;});return hash}function formatValue(ctx,value,recurseTimes){if(ctx.customInspect&&value&&isFunction(value.inspect)&&value.inspect!==exports.inspect&&!(value.constructor&&value.constructor.prototype===value)){var ret=value.inspect(recurseTimes,ctx);if(!isString(ret)){ret=formatValue(ctx,ret,recurseTimes);}return ret}var primitive=formatPrimitive(ctx,value);if(primitive){return primitive}var keys=Object.keys(value);var visibleKeys=arrayToHash(keys);if(ctx.showHidden){keys=Object.getOwnPropertyNames(value);}if(isError(value)&&(keys.indexOf("message")>=0||keys.indexOf("description")>=0)){return formatError(value)}if(keys.length===0){if(isFunction(value)){var name=value.name?": "+value.name:"";return ctx.stylize("[Function"+name+"]","special")}if(isRegExp(value)){return ctx.stylize(RegExp.prototype.toString.call(value),"regexp")}if(isDate(value)){return ctx.stylize(Date.prototype.toString.call(value),"date")}if(isError(value)){return formatError(value)}}var base="",array=false,braces=["{","}"];if(isArray(value)){array=true;braces=["[","]"];}if(isFunction(value)){var n=value.name?": "+value.name:"";base=" [Function"+n+"]";}if(isRegExp(value)){base=" "+RegExp.prototype.toString.call(value);}if(isDate(value)){base=" "+Date.prototype.toUTCString.call(value);}if(isError(value)){base=" "+formatError(value);}if(keys.length===0&&(!array||value.length==0)){return braces[0]+base+braces[1]}if(recurseTimes<0){if(isRegExp(value)){return ctx.stylize(RegExp.prototype.toString.call(value),"regexp")}else{return ctx.stylize("[Object]","special")}}ctx.seen.push(value);var output;if(array){output=formatArray(ctx,value,recurseTimes,visibleKeys,keys);}else{output=keys.map(function(key){return formatProperty(ctx,value,recurseTimes,visibleKeys,key,array)});}ctx.seen.pop();return reduceToSingleString(output,base,braces)}function formatPrimitive(ctx,value){if(isUndefined(value))return ctx.stylize("undefined","undefined");if(isString(value)){var simple="'"+JSON.stringify(value).replace(/^"|"$/g,"").replace(/'/g,"\\'").replace(/\\"/g,'"')+"'";return ctx.stylize(simple,"string")}if(isNumber(value))return ctx.stylize(""+value,"number");if(isBoolean(value))return ctx.stylize(""+value,"boolean");if(isNull(value))return ctx.stylize("null","null")}function formatError(value){return"["+Error.prototype.toString.call(value)+"]"}function formatArray(ctx,value,recurseTimes,visibleKeys,keys){var output=[];for(var i=0,l=value.length;i<l;++i){if(hasOwnProperty(value,String(i))){output.push(formatProperty(ctx,value,recurseTimes,visibleKeys,String(i),true));}else{output.push("");}}keys.forEach(function(key){if(!key.match(/^\d+$/)){output.push(formatProperty(ctx,value,recurseTimes,visibleKeys,key,true));}});return output}function formatProperty(ctx,value,recurseTimes,visibleKeys,key,array){var name,str,desc;desc=Object.getOwnPropertyDescriptor(value,key)||{value:value[key]};if(desc.get){if(desc.set){str=ctx.stylize("[Getter/Setter]","special");}else{str=ctx.stylize("[Getter]","special");}}else{if(desc.set){str=ctx.stylize("[Setter]","special");}}if(!hasOwnProperty(visibleKeys,key)){name="["+key+"]";}if(!str){if(ctx.seen.indexOf(desc.value)<0){if(isNull(recurseTimes)){str=formatValue(ctx,desc.value,null);}else{str=formatValue(ctx,desc.value,recurseTimes-1);}if(str.indexOf("\n")>-1){if(array){str=str.split("\n").map(function(line){return"  "+line}).join("\n").substr(2);}else{str="\n"+str.split("\n").map(function(line){return"   "+line}).join("\n");}}}else{str=ctx.stylize("[Circular]","special");}}if(isUndefined(name)){if(array&&key.match(/^\d+$/)){return str}name=JSON.stringify(""+key);if(name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)){name=name.substr(1,name.length-2);name=ctx.stylize(name,"name");}else{name=name.replace(/'/g,"\\'").replace(/\\"/g,'"').replace(/(^"|"$)/g,"'");name=ctx.stylize(name,"string");}}return name+": "+str}function reduceToSingleString(output,base,braces){var numLinesEst=0;var length=output.reduce(function(prev,cur){numLinesEst++;if(cur.indexOf("\n")>=0)numLinesEst++;return prev+cur.replace(/\u001b\[\d\d?m/g,"").length+1},0);if(length>60){return braces[0]+(base===""?"":base+"\n ")+" "+output.join(",\n  ")+" "+braces[1]}return braces[0]+base+" "+output.join(", ")+" "+braces[1]}function isArray(ar){return Array.isArray(ar)}exports.isArray=isArray;function isBoolean(arg){return typeof arg==="boolean"}exports.isBoolean=isBoolean;function isNull(arg){return arg===null}exports.isNull=isNull;function isNullOrUndefined(arg){return arg==null}exports.isNullOrUndefined=isNullOrUndefined;function isNumber(arg){return typeof arg==="number"}exports.isNumber=isNumber;function isString(arg){return typeof arg==="string"}exports.isString=isString;function isSymbol(arg){return typeof arg==="symbol"}exports.isSymbol=isSymbol;function isUndefined(arg){return arg===void 0}exports.isUndefined=isUndefined;function isRegExp(re){return isObject(re)&&objectToString(re)==="[object RegExp]"}exports.isRegExp=isRegExp;function isObject(arg){return typeof arg==="object"&&arg!==null}exports.isObject=isObject;function isDate(d){return isObject(d)&&objectToString(d)==="[object Date]"}exports.isDate=isDate;function isError(e){return isObject(e)&&(objectToString(e)==="[object Error]"||e instanceof Error)}exports.isError=isError;function isFunction(arg){return typeof arg==="function"}exports.isFunction=isFunction;function isPrimitive(arg){return arg===null||typeof arg==="boolean"||typeof arg==="number"||typeof arg==="string"||typeof arg==="symbol"||typeof arg==="undefined"}exports.isPrimitive=isPrimitive;exports.isBuffer=require("./support/isBuffer");function objectToString(o){return Object.prototype.toString.call(o)}function pad(n){return n<10?"0"+n.toString(10):n.toString(10)}var months=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];function timestamp(){var d=new Date;var time=[pad(d.getHours()),pad(d.getMinutes()),pad(d.getSeconds())].join(":");return[d.getDate(),months[d.getMonth()],time].join(" ")}exports.log=function(){console.log("%s - %s",timestamp(),exports.format.apply(exports,arguments));};exports.inherits=require("inherits");exports._extend=function(origin,add){if(!add||!isObject(add))return origin;var keys=Object.keys(add);var i=keys.length;while(i--){origin[keys[i]]=add[keys[i]];}return origin};function hasOwnProperty(obj,prop){return Object.prototype.hasOwnProperty.call(obj,prop)}}).call(this,require("_process"),typeof commonjsGlobal!=="undefined"?commonjsGlobal:typeof self!=="undefined"?self:typeof window!=="undefined"?window:{});},{"./support/isBuffer":53,_process:31,inherits:52}],55:[function(require,module,exports){(function(process,global,Buffer){"use strict";var through=require("through2");var duplexify=require("duplexify");var WS=require("ws");module.exports=WebSocketStream;function WebSocketStream(target,protocols,options){var stream,socket;var isBrowser=process.title==="browser";var isNative=!!global.WebSocket;var socketWrite=isBrowser?socketWriteBrowser:socketWriteNode;var proxy=through.obj(socketWrite,socketEnd);if(protocols&&!Array.isArray(protocols)&&"object"===typeof protocols){options=protocols;protocols=null;if(typeof options.protocol==="string"||Array.isArray(options.protocol)){protocols=options.protocol;}}if(!options)options={};var bufferSize=options.browserBufferSize||1024*512;var bufferTimeout=options.browserBufferTimeout||1e3;if(typeof target==="object"){socket=target;}else{if(isNative&&isBrowser){socket=new WS(target,protocols);}else{socket=new WS(target,protocols,options);}socket.binaryType="arraybuffer";}if(socket.readyState===WS.OPEN){stream=proxy;}else{stream=duplexify.obj();socket.onopen=onopen;}stream.socket=socket;socket.onclose=onclose;socket.onerror=onerror;socket.onmessage=onmessage;proxy.on("close",destroy);var coerceToBuffer=options.binary||options.binary===undefined;function socketWriteNode(chunk,enc,next){if(coerceToBuffer&&typeof chunk==="string"){chunk=new Buffer(chunk,"utf8");}socket.send(chunk,next);}function socketWriteBrowser(chunk,enc,next){if(socket.bufferedAmount>bufferSize){setTimeout(socketWriteBrowser,bufferTimeout,chunk,enc,next);return}if(coerceToBuffer&&typeof chunk==="string"){chunk=new Buffer(chunk,"utf8");}try{socket.send(chunk);}catch(err){return next(err)}next();}function socketEnd(done){socket.close();done();}function onopen(){stream.setReadable(proxy);stream.setWritable(proxy);stream.emit("connect");}function onclose(){stream.end();stream.destroy();}function onerror(err){stream.destroy(err);}function onmessage(event){var data=event.data;if(data instanceof ArrayBuffer)data=new Buffer(new Uint8Array(data));else data=new Buffer(data);proxy.push(data);}function destroy(){socket.close();}return stream}}).call(this,require("_process"),typeof commonjsGlobal!=="undefined"?commonjsGlobal:typeof self!=="undefined"?self:typeof window!=="undefined"?window:{},require("buffer").Buffer);},{_process:31,buffer:11,duplexify:14,through2:48,ws:56}],56:[function(require,module,exports){var ws=null;if(typeof WebSocket!=="undefined"){ws=WebSocket;}else if(typeof MozWebSocket!=="undefined"){ws=MozWebSocket;}else{ws=window.WebSocket||window.MozWebSocket;}module.exports=ws;},{}],57:[function(require,module,exports){module.exports=wrappy;function wrappy(fn,cb){if(fn&&cb)return wrappy(fn)(cb);if(typeof fn!=="function")throw new TypeError("need wrapper function");Object.keys(fn).forEach(function(k){wrapper[k]=fn[k];});return wrapper;function wrapper(){var args=new Array(arguments.length);for(var i=0;i<args.length;i++){args[i]=arguments[i];}var ret=fn.apply(this,args);var cb=args[args.length-1];if(typeof ret==="function"&&ret!==cb){Object.keys(cb).forEach(function(k){ret[k]=cb[k];});}return ret}}},{}],58:[function(require,module,exports){module.exports=extend;var hasOwnProperty=Object.prototype.hasOwnProperty;function extend(){var target={};for(var i=0;i<arguments.length;i++){var source=arguments[i];for(var key in source){if(hasOwnProperty.call(source,key)){target[key]=source[key];}}}return target}},{}]},{},[7])(7)});
});

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

      connect(this.get('url'))
        .then(function (mqt) {
          this$1.set({state: 'connected'});
          this$1.fire('connected', mqt);
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


//mqtt@2.4.0/dist/mqtt.min.js

// const connect = url => {
//   const mqt = MQT(url)
//   return mqt.ready.then(() => mqt)
// }

window.mqtt = mqtt_min;

var client  = mqtt_min.connect('ws://iot.benjaminbenben.eu');

client.on('connect', function () {
  client.subscribe('presence');
  client.publish('presence', 'Hello mqtt');
});

client.on('message', function (topic, message) {
  // message is Buffer
  console.log(message.toString());
  // client.end()
});


window.client = client;

var connect = function (url) {

  var client = mqtt_min.connect(url);

  return new Promise(function (resolve, reject) {
    var handled;

    client.on('connect', function () {
      if(!handled) {
        resolve(client);
        handled = true;
      }
    });
    client.on('error', function () {
      if(!handled) {
        reject(client);
        client.end();
      }
    });

    setTimeout(function () {
      if(!handled) {
        handled = true;
        client.end();
        reject();
      }
    }, 10000);
  })

  return Promise.resolve(client)


  // return mqt.ready.then(() => mqt)
};



return template;


}());

var addedCss = false;
function addCss () {
	var style = createElement( 'style' );
	style.textContent = "\n\n  [svelte-4285025927]#url, [svelte-4285025927] #url {\n    transition: .2s\n  }\n\n  [svelte-4285025927]#submit, [svelte-4285025927] #submit {\n    color: inherit;\n    border: none;\n    background: none;\n    padding:0;\n    text-decoration: underline;\n    cursor: pointer;\n    transition: .2s\n  }\n  [svelte-4285025927]#submit:hover, [svelte-4285025927] #submit:hover {\n    color: #08f\n  }\n\n  [svelte-4285025927]#root.error #url, [svelte-4285025927] #root.error #url{\n    color: #f00\n  }\n  [svelte-4285025927]#root.error #submit, [svelte-4285025927] #root.error #submit{\n    color: #f00\n  }\n\n  [svelte-4285025927]#state, [svelte-4285025927] #state {\n    height: 10px;\n    background: #ccc;\n    margin-bottom: 1em;\n    transition: 1s;\n    border-radius: 0 0 2px 2px;\n  }\n\n  [svelte-4285025927]#state, [svelte-4285025927] #state {\n    background: #ccc;\n  }\n\n  [svelte-4285025927]#root.connecting #state, [svelte-4285025927] #root.connecting #state {\n    background: #000\n  }\n\n  [svelte-4285025927]#root.connected #state, [svelte-4285025927] #root.connected #state{\n    background: aquamarine\n  }\n\n  [svelte-4285025927]#root.connected #connection, [svelte-4285025927] #root.connected #connection {\n    display:none\n  }\n\n";
	appendNode( style, document.head );

	addedCss = true;
}

function renderMainFragment ( root, component ) {
	var div = createElement( 'div' );
	setAttribute( div, 'svelte-4285025927', '' );
	div.id = "root";
	var last_div_class = root.state;
	div.className = last_div_class;
	
	var div1 = createElement( 'div' );
	setAttribute( div1, 'svelte-4285025927', '' );
	div1.id = "state";
	
	appendNode( div1, div );
	appendNode( createText( "\n\n  " ), div );
	
	var form = createElement( 'form' );
	setAttribute( form, 'svelte-4285025927', '' );
	form.id = "connection";
	
	function submitHandler ( event ) {
		component.connect(event);
	}
	
	addEventListener( form, 'submit', submitHandler );
	
	var last_form_class = root.state;
	form.className = last_form_class;
	
	appendNode( form, div );
	
	var input = createElement( 'input' );
	setAttribute( input, 'svelte-4285025927', '' );
	input.id = "url";
	input.type = "text";
	input.placeholder = "url";
	
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
	
	appendNode( input, form );
	
	input.value = root.url;
	
	appendNode( createText( "\n    " ), form );
	
	var input1 = createElement( 'input' );
	setAttribute( input1, 'svelte-4285025927', '' );
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
			
			if ( !input1_updating ) {
							input1.value = root.submit_text;
						}
		},
		
		teardown: function ( detach ) {
			removeEventListener( form, 'submit', submitHandler );
			removeEventListener( input, 'input', inputChangeHandler );
			removeEventListener( input, 'keyup', keyupHandler );
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

connection.on('connected', function (client) {

  console.log("Connected", client);

  document.body.addEventListener('click', function (e) {
    e.preventDefault();
    var v = ~~(Math.random()*255);
    client.publish('/debug/press', v);
  }, false);

  client.subscribe('/debug/press');

  client.on('message', function (topic, buffer) {
    var payload = buffer.toString();
    console.log("message:", topic, payload);

    document.body.style.backgroundColor =
      "hsl(" + payload + ", 50%, 50%)";
  });

});
