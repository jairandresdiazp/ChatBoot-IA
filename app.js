/* jshint node: true, devel: true */
'use strict';

const
    favicon = require('serve-favicon'),
    path = require('path'),
    bodyParser = require('body-parser'),
    config = require('config'),
    crypto = require('crypto'),
    express = require('express'),
    https = require('https'),
    request = require('request'),
    unirest = require("unirest"),
    firebase = require("firebase"),
    Wolfram = require("./Wolfram.js"),
    ChatBoot = require("./ChatBoot.js"),
    Domotica = require("./Domotica.js"),
    CeluCambio = require("./CeluCambio.js");

var basicAuth = require('basic-auth');
var app = express();
app.set('port', process.env.PORT || 5000);
app.set('view engine', 'ejs');
app.use(bodyParser.json({
    verify: verifyRequestSignature
}));
app.use(express.static('public'));
app.use(express.static('views'));
app.use(favicon(path.join(__dirname, 'views', 'favicon.ico')));


/*
 * Conexion con firebase
 *
 */

firebase.initializeApp({
    serviceAccount: "ChatBoot-IA-Firebase.json",
    databaseURL: "https://chatboot-ia.firebaseio.com"
});

var DB = firebase.database();


var onComplete = function(error) {
    if (error) {
        console.log('Synchronization firebase failed');
    }
};

/*
 * Be sure to setup your config values before running this code. You can 
 * set them using environment variables or modifying the config file in /config.
 *
 */

const TOKEN_TTL = (process.env.TOKEN_TTL) ?
    (process.env.TOKEN_TTL) :
    config.get('tokenTTL');

// App Secret can be retrieved from the App Dashboard
const APP_SECRET = (process.env.MESSENGER_APP_SECRET) ?
    process.env.MESSENGER_APP_SECRET :
    config.get('appSecret');

// Arbitrary value used to validate a webhook
const VALIDATION_TOKEN = (process.env.MESSENGER_VALIDATION_TOKEN) ?
    (process.env.MESSENGER_VALIDATION_TOKEN) :
    config.get('validationToken');

// Generate a page access token for your page from the App Dashboard
const PAGE_ACCESS_TOKEN = (process.env.MESSENGER_PAGE_ACCESS_TOKEN) ?
    (process.env.MESSENGER_PAGE_ACCESS_TOKEN) :
    config.get('pageAccessToken');

// URL where the app is running (include protocol). Used to point to scripts and 
// assets located at this address. 
const SERVER_URL = (process.env.SERVER_URL) ?
    (process.env.SERVER_URL) :
    config.get('serverURL');

if (!(APP_SECRET && VALIDATION_TOKEN && PAGE_ACCESS_TOKEN && SERVER_URL)) {
    console.error("Missing config values");
    process.exit(1);
}

const USER_AUTH = (process.env.USER_AUTH) ?
    (process.env.USER_AUTH) :
    config.get('userAuth');

const PASS_AUTH = (process.env.PASS_AUTH) ?
    (process.env.PASS_AUTH) :
    config.get('passAuth');

var auth = function(req, res, next) {
    var user = basicAuth(req);
    if (!user || !user.name || !user.pass) {
        res.set('WWW-Authenticate', 'Basic realm=Authorization Required');
        res.status(401).send({
            Message: "Authorization has been denied for this request"
        });
        return;
    }
    if (user.name === USER_AUTH && user.pass === PASS_AUTH) {
        next();
    } else {
        res.set('WWW-Authenticate', 'Basic realm=Authorization Required');
        res.status(401).send({
            Message: "Authorization has been denied for this request"
        });
        return;
    }
};

/*
 * messing routes  
 *
 */
require('./routes.js')(app, auth, DB);

/*
 * Use your own validation token. Check that the token used in the Webhook 
 * setup is the same token used here.
 *
 */
app.get('/webhook', function(req, res) {
    if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === VALIDATION_TOKEN) {
        res.status(200).send(req.query['hub.challenge']);
    } else {
        console.error("Failed validation. Make sure the validation tokens match.");
        res.sendStatus(403);
    }
});


/*
 * All callbacks for Messenger are POST-ed. They will be sent to the same
 * webhook. Be sure to subscribe your app to your page to receive callbacks
 * for your page. 
 * https://developers.facebook.com/docs/messenger-platform/product-overview/setup#subscribe_app
 *
 */
app.post('/webhook', function(req, res) {
    var data = req.body;

    // Make sure this is a page subscription
    if (data.object == 'page') {
        // Iterate over each entry
        // There may be multiple if batched
        data.entry.forEach(function(pageEntry) {
            var pageID = pageEntry.id;
            var timeOfEvent = pageEntry.time;

            // Iterate over each messaging event
            pageEntry.messaging.forEach(function(messagingEvent) {
                if (messagingEvent.optin) {
                    receivedAuthentication(messagingEvent);
                } else if (messagingEvent.message) {
                    receivedMessage(messagingEvent);
                } else if (messagingEvent.delivery) {
                    receivedDeliveryConfirmation(messagingEvent);
                } else if (messagingEvent.postback) {
                    receivedPostback(messagingEvent);
                } else if (messagingEvent.read) {
                    receivedMessageRead(messagingEvent);
                } else if (messagingEvent.account_linking) {
                    receivedAccountLink(messagingEvent);
                } else {
                    console.log("Webhook received unknown messagingEvent: ", messagingEvent);
                }
            });
        });

        // Assume all went well.
        //
        // You must send back a 200, within 20 seconds, to let us know you've 
        // successfully received the callback. Otherwise, the request will time out.
        res.sendStatus(200);
    }
});

/*
 * This path is used for account linking. The account linking call-to-action
 * (sendAccountLinking) is pointed to this URL. 
 * 
 */
app.get('/authorize', function(req, res) {
    var accountLinkingToken = req.query['account_linking_token'];
    var redirectURI = req.query['redirect_uri'];

    // Authorization Code should be generated per user by the developer. This will 
    // be passed to the Account Linking callback.
    var authCode = "1234567890";

    // Redirect users to this URI on successful login
    var redirectURISuccess = redirectURI + "&authorization_code=" + authCode;

    res.render('authorize', {
        accountLinkingToken: accountLinkingToken,
        redirectURI: redirectURI,
        redirectURISuccess: redirectURISuccess
    });
});

/*
 * Verify that the callback came from Facebook. Using the App Secret from 
 * the App Dashboard, we can verify the signature that is sent with each 
 * callback in the x-hub-signature field, located in the header.
 *
 * https://developers.facebook.com/docs/graph-api/webhooks#setup
 *
 */
function verifyRequestSignature(req, res, buf) {
    if (req.url == "/webhook") {
        var signature = req.headers["x-hub-signature"];
        if (!signature) {
            // For testing, let's log an error. In production, you should throw an 
            // error.
            console.error("Couldn't validate the signature.");
        } else {
            var elements = signature.split('=');
            var method = elements[0];
            var signatureHash = elements[1];

            var expectedHash = crypto.createHmac('sha1', APP_SECRET)
                .update(buf)
                .digest('hex');

            if (signatureHash != expectedHash) {
                throw new Error("Couldn't validate the request signature.");
            }
        }
    };
}

/*
 * Authorization Event
 *
 * The value for 'optin.ref' is defined in the entry point. For the "Send to 
 * Messenger" plugin, it is the 'data-ref' field. Read more at 
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/authentication
 *
 */
function receivedAuthentication(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var timeOfAuth = event.timestamp;

    // The 'ref' field is set in the 'Send to Messenger' plugin, in the 'data-ref'
    // The developer can set this to an arbitrary value to associate the 
    // authentication callback with the 'Send to Messenger' click event. This is
    // a way to do account linking when the user clicks the 'Send to Messenger' 
    // plugin.
    var passThroughParam = event.optin.ref;

    // When an authentication is received, we'll send a message back to the sender
    // to let them know it was successful.
    sendTextMessage(senderID, "Authentication successful");
}

/*
 * Message Event
 *
 * This event is called when a message is sent to your page. The 'message' 
 * object format can vary depending on the kind of message that was received.
 * Read more at https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-received
 *
 * For this example, we're going to echo any text that we get. If we get some 
 * special keywords ('button', 'generic', 'receipt'), then we'll send back
 * examples of those bubbles to illustrate the special message bubbles we've 
 * created. If we receive a message with an attachment (image, video, audio), 
 * then we'll simply confirm that we've received the attachment.
 * 
 */
function receivedMessage(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var timeOfMessage = event.timestamp;
    var message = event.message;

    var isEcho = message.is_echo;
    var messageId = message.mid;
    var appId = message.app_id;
    var metadata = message.metadata;

    // You may get a text or attachment but not both
    var messageText = message.text;
    var messageAttachments = message.attachments;
    var quickReply = message.quick_reply;

    var LogMessage = DB.ref("LogMessage").push();
    var Person = DB.ref("Person/" + recipientID);

    if (appId != null) {
        LogMessage.set({
            Acount: "Facebook",
            senderID: "" + senderID,
            recipientID: "" + recipientID,
            message: {
                message
            }
        }, onComplete);
        //guarda la informacion de los usuarios que usan el Chat
        ChatBoot.GetInfoPersonFacebook(recipientID, function(response) {
            if (response) {
                Person.update({
                    ID: "" + recipientID,
                    From: "Facebook",
                    FirtsName: response.first_name,
                    LastName: response.last_name
                }, onComplete);
            }
        });
    }
    if (isEcho) {
        // Just logging message echoes to console
        console.log("Received echo for message %s and app %d with metadata %s",
            messageId, appId, metadata);
        return;
    } else if (quickReply) {
        var quickReplyPayload = quickReply.payload;
        sendTextMessage(senderID, "Quick reply tapped");
        return;
    }

    if (messageText) {

        // If we receive a text message, check to see if it matches any special
        // keywords and send back the corresponding example. Otherwise, just echo
        // the text we received.
        switch (messageText.toLowerCase().trim()) {
            case 'image':
                sendImageMessage(senderID);
                break;

            case 'gif':
                sendGifMessage(senderID);
                break;

            case 'audio':
                sendAudioMessage(senderID);
                break;

            case 'video':
                sendVideoMessage(senderID);
                break;

            case 'file':
                sendFileMessage(senderID);
                break;

            case 'button':
                sendButtonMessage(senderID);
                break;

            case 'generic':
                sendGenericMessage(senderID);
                break;

            case 'receipt':
                sendReceiptMessage(senderID);
                break;

            case 'quick reply':
                sendQuickReply(senderID);
                break;

            case 'read receipt':
                sendReadReceipt(senderID);
                break;

            case 'typing on':
                sendTypingOn(senderID);
                break;

            case 'typing off':
                sendTypingOff(senderID);
                break;

            case 'account linking':
                sendAccountLinking(senderID);
                break;

            default:
                try {
                    if (messageText.charAt(0) == "@") {
                        var separador = " ";
                        var identificador = messageText.split(separador)[0].trim();
                        var parameters = "";
                        try {
                            for (var index = 1; index < messageText.split(separador).length; index++) {
                                parameters = parameters + messageText.split(separador)[index].trim();
                            }
                        } catch (err) {}
                        switch (identificador.toLowerCase().trim()) {
                            case '@citas':
                                ChatBoot.GetInfoPerson(parameters, function(response) {
                                    if (response.Data) {
                                        ChatBoot.SendMessageInfoPerson(senderID, response.Data.Name, response.Data.Phone);
                                    } else {
                                        sendTextMessage(senderID, "No encontramos citas programadas");
                                    }
                                }, function(error) {
                                    if (error) {
                                        ChatBoot.GetInfoPersonFacebook(senderID, function(response) {
                                            if (response) {
                                                ChatBoot.SendMessageInfoPerson(senderID, response.first_name + " " + response.last_name, 6910810);
                                            }
                                        });
                                    }
                                });
                                break;
                            case '@facturas':
                                ChatBoot.GetInfoPerson(parameters, function(response) {
                                    if (response.Data) {
                                        ChatBoot.SendMessageInvoicePerson(senderID, response.Data.Name, SERVER_URL + "/assets/factura.pdf");
                                    } else {
                                        sendTextMessage(senderID, "No encontramos facturas");
                                    }
                                }, function(error) {
                                    if (error) {
                                        ChatBoot.GetInfoPersonFacebook(senderID, function(response) {
                                            if (response) {
                                                ChatBoot.SendMessageInvoicePerson(senderID, response.first_name + " " + response.last_name, SERVER_URL + "/assets/factura.pdf");
                                            }
                                        });
                                    }
                                });
                                break;
                            case '@token':
                                if (parameters.length >= 10) {
                                    ChatBoot.GetInfoPersonFacebook(senderID, function(response) {
                                        if (response) {
                                            Person = DB.ref("Person/" + senderID);
                                            Person.update({
                                                Phone: parameters
                                            }, onComplete);
                                            ChatBoot.SendMessageToken(parameters, response.first_name + " " + response.last_name, function(error, token) {
                                                if (error) {
                                                    sendTextMessage(senderID, "No pudimos enviar el token de seguridad al numero " + parameters + " verifique que sea correcto");
                                                } else {
                                                    //guardar el token para el usuario 
                                                    Person.update({
                                                        Token: token,
                                                        TokenTTL: TOKEN_TTL,
                                                        TokenTimeStamp: firebase.database.ServerValue.TIMESTAMP
                                                    }, onComplete);
                                                    sendTextMessage(senderID, "Enviamos el token de seguridad al numero " + parameters);
                                                }
                                            });
                                        }
                                    });
                                } else {
                                    sendTextMessage(senderID, "El numero indicado no es valido");
                                }
                                break;
                            case '@servicios':
                                ChatBoot.SendMessageServices(senderID);
                                break;
                            case '@magic':
                                Wolfram.SolveWolfram(senderID, parameters);
                                break;
                            case '@luces':
                                Domotica.ActivarLuces(senderID);
                                break;
                            case '@celucambio':
                                CeluCambio.ActivarChatCeluCambio(DB,senderID);
                                break;
                            default:
                                sendTextMessage(senderID, "Consulte la guia de token en el menu " + messageText + " no es valido");
                        }
                    } else {
                        var ChatCeluCambio = DB.ref('ChatCeluCambio');
                        ChatCeluCambio.once("value", function(res) {
                            var CaluCambioConfig = res.child("Active").val();
                            if(CaluCambioConfig){
                                var acentos = "ÃÀÁÄÂÈÉËÊÌÍÏÎÒÓÖÔÙÚÜÛãàáäâèéëêìíïîòóöôùúüûÑñÇç";
                                var data= messageText.toLowerCase();
                                for (var i=0; i<acentos.length; i++) {
                                    data = data.replace(acentos.charAt(i), messageText.toLowerCase().charAt(i));
                                }
                                if(data.indexOf("hola")||data.indexOf("buenos dias")||data.indexOf("buenas noches")||data.indexOf("buenas tardes")){
                                    ChatBoot.GetInfoPersonFacebook(senderID, function(response) {
                                        if (response) {
                                            sendTextMessage(senderID, "Hola " + response.first_name + " cuentanos en que te podemos ayudar, en CeluCambio  tenemos un telefono pata ti");
                                        }
                                    });
                                }else if(data.indexOf("cambios")||data.indexOf("cambiar")){
                                    CeluCambio.SendMessageCambios(senderID);
                                }
                                else if(data.indexOf("ubicados")||data.indexOf("ubicacion")||data.indexOf("direccion")){
                                    var messageData = {
                                        recipient: {
                                            id: senderID
                                        },
                                        message: {
                                            attachment: {
                                                type: "template",
                                                payload: {
                                                    template_type: "generic",
                                                    elements: [{
                                                        title: "CeluCambio",
                                                        item_url: "http://www.celucambio.com/",
                                                        subtitle: "Hola " + response.first_name + ", te enseñaremos la ruta usando Google Maps",
                                                        buttons: [{
                                                            type: "web_url",
                                                            url: "https://www.google.es/maps/dir//Cra.+29c+%2375-22,+Bogot%C3%A1,+Colombia/@4.6694833,-74.0731626,17z/data=!4m16!1m7!3m6!1s0x8e3f9af92c5f4049:0x413e44830baaa9c!2sCra.+29c+%2375-22,+Bogot%C3%A1,+Colombia!3b1!8m2!3d4.6694833!4d-74.0709739!4m7!1m0!1m5!1m1!1s0x8e3f9af92c5f4049:0x413e44830baaa9c!2m2!1d-74.0709739!2d4.6694833",
                                                            title: "Ver Mapa"
                                                        }]
                                                    }]
                                                }
                                            }
                                        }
                                    };
                                    callSendAPI(messageData);
                                }
                            }
                            else{
                                ChatBoot.GetInfoPersonFacebook(senderID, function(response) {
                                    if (response) {
                                        sendTextMessage(senderID, "Hola " + response.first_name + " " + response.last_name + ", consulta nuestra guia de token en el menu 🏥");
                                    } else {
                                        sendTextMessage(senderID, "Hola, consulta nuestra guia de token en el menu 🏥");
                                    }
                                });
                            }
                        });
                    }
                } catch (err) {
                    sendTextMessage(senderID, "Consulte la guia de token en el menu " + messageText + " no es valido");
                }
        }
    } else if (messageAttachments) {
        //sendTextMessage(senderID, "Message with attachment received");
    }
}


/*
 * Delivery Confirmation Event
 *
 * This event is sent to confirm the delivery of a message. Read more about 
 * these fields at https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-delivered
 *
 */
function receivedDeliveryConfirmation(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var delivery = event.delivery;
    var messageIDs = delivery.mids;
    var watermark = delivery.watermark;
    var sequenceNumber = delivery.seq;

    if (messageIDs) {
        messageIDs.forEach(function(messageID) {

        });
    }
}


/*
 * Postback Event
 *
 * This event is called when a postback is tapped on a Structured Message. 
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/postback-received
 * 
 */
function receivedPostback(event) {
    var Luces = DB.ref('Luces');
    var ChatCeluCambio = DB.ref('ChatCeluCambio');
    
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var timeOfPostback = event.timestamp;

    // The 'payload' param is a developer-defined field which is set in a postback 
    // button for Structured Messages. 
    var payload = event.postback.payload;

    switch (payload.toLowerCase().trim()) {
        case 'start':
            var ChatCeluCambio = DB.ref('ChatCeluCambio');
            ChatCeluCambio.once("value", function(res) {
                var CaluCambioConfig = res.child("Active").val();
                if(CaluCambioConfig){
                    ChatBoot.GetInfoPersonFacebook(senderID, function(response) {
                        if (response) {
                            sendTextMessage(senderID, "Hola " + response.first_name + " cuentanos en que te podemos ayudar, en CeluCambio  tenemos un telefono pata ti");
                        }
                    });
                }
                else{
                    ChatBoot.GetInfoPersonFacebook(senderID, function(response) {
                        if (response) {
                            sendTextMessage(senderID, "Hola " + response.first_name + " " + response.last_name + ", consulta nuestra guia de token en el menu 🏥");
                        } else {
                            sendTextMessage(senderID, "Hola, consulta nuestra guia de token en el menu 🏥");
                        }
                    });
                }
            }); 
        case 'new':
            var ChatCeluCambio = DB.ref('ChatCeluCambio');
            ChatCeluCambio.once("value", function(res) {
                var CaluCambioConfig = res.child("Active").val();
                if(CaluCambioConfig){
                    ChatBoot.GetInfoPersonFacebook(senderID, function(response) {
                        if (response) {
                            sendTextMessage(senderID, "Hola " + response.first_name + " cuentanos en que te podemos ayudar, en CeluCambio  tenemos un telefono pata ti");
                        }
                    });
                }
                else{
                    ChatBoot.GetInfoPersonFacebook(senderID, function(response) {
                        if (response) {
                            sendTextMessage(senderID, "Hola " + response.first_name + " " + response.last_name + ", consulta nuestra guia de token en el menu 🏥");
                        } else {
                            sendTextMessage(senderID, "Hola, consulta nuestra guia de token en el menu 🏥");
                        }
                    });
                }
            }); 
            break;
        case 'help':
            var ChatCeluCambio = DB.ref('ChatCeluCambio');
            ChatCeluCambio.once("value", function(res) {
                var CaluCambioConfig = res.child("Active").val();
                if(CaluCambioConfig){
                    ChatBoot.GetInfoPersonFacebook(senderID, function(response) {
                        if (response) {
                                var messageData = {
                                recipient: {
                                    id: senderID
                                },
                                message: {
                                    attachment: {
                                        type: "template",
                                        payload: {
                                            template_type: "generic",
                                            elements: [{
                                                title: "CeluCambio",
                                                item_url: "http://www.celucambio.com/",
                                                subtitle: "Hola " + response.first_name + ", en el siguiente video te explicaremos como funciona todo",
                                                buttons: [{
                                                    type: "web_url",
                                                    url: "https://www.youtube.com/watch?v=pJecvz11JW4",
                                                    title: "Ver Video"
                                                }]
                                            }]
                                        }
                                    }
                                }
                            };
                            callSendAPI(messageData);
                        }
                    });
                }
                else{
                    sendTextMessage(senderID, "escribenos al correo jairandresdiazp@gmail.com");
                }
            }); 
            break;
        case '00001':
            sendTextMessage(senderID, "Cita confirmada");
            break;
        case '00002':
            sendTextMessage(senderID, "Cita cancelada");
            break;
        case '00003':
            Luces.once("value", function(res) {
                var luzSala = res.child("Sala").val();
                if(!luzSala){
                    Luces.update({ Sala: true });
                }
              });
            break;
        case '00004':
            Luces.update({ Sala: false });
            break;
        case '00005':
            ChatCeluCambio.once("value", function(res) {
                var CaluCambioConfig = res.child("Active").val();
                if(!CaluCambioConfig){
                    ChatCeluCambio.update({ Active: true });
                }
              });
            break;
        case '00006':
            ChatCeluCambio.update({ Active: false });
            break;
        default:
            sendTextMessage(senderID, "Accion no definida");
    }

    // When a postback is called, we'll send a message back to the sender to 
    // let them know it was successful
}

/*
 * Message Read Event
 *
 * This event is called when a previously-sent message has been read.
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-read
 * 
 */
function receivedMessageRead(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;

    // All messages before watermark (a timestamp) or sequence have been seen.
    var watermark = event.read.watermark;
    var sequenceNumber = event.read.seq;

}

/*
 * Account Link Event
 *
 * This event is called when the Link Account or UnLink Account action has been
 * tapped.
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/account-linking
 * 
 */
function receivedAccountLink(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;

    var status = event.account_linking.status;
    var authCode = event.account_linking.authorization_code;

}

/*
 * Send an image using the Send API.
 *
 */
function sendImageMessage(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "image",
                payload: {
                    url: SERVER_URL + "/assets/rift.png"
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
 * Send a Gif using the Send API.
 *
 */
function sendGifMessage(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "image",
                payload: {
                    url: SERVER_URL + "/assets/instagram_logo.gif"
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
 * Send audio using the Send API.
 *
 */
function sendAudioMessage(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "audio",
                payload: {
                    url: SERVER_URL + "/assets/sample.mp3"
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
 * Send a video using the Send API.
 *
 */
function sendVideoMessage(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "video",
                payload: {
                    url: SERVER_URL + "/assets/allofus480.mov"
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
 * Send a video using the Send API.
 *
 */
function sendFileMessage(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "file",
                payload: {
                    url: SERVER_URL + "/assets/test.txt"
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
 * Send a text message using the Send API.
 *
 */
function sendTextMessage(recipientId, messageText) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            text: messageText,
            metadata: "DEVELOPER_DEFINED_METADATA"
        }
    };

    callSendAPI(messageData);
}

/*
 * Send a button message using the Send API.
 *
 */
function sendButtonMessage(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "template",
                payload: {
                    template_type: "button",
                    text: "This is test text",
                    buttons: [{
                        type: "web_url",
                        url: "https://www.oculus.com/en-us/rift/",
                        title: "Open Web URL"
                    }, {
                        type: "postback",
                        title: "Trigger Postback",
                        payload: "DEVELOPED_DEFINED_PAYLOAD"
                    }, {
                        type: "phone_number",
                        title: "Call Phone Number",
                        payload: "+16505551234"
                    }]
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
 * Send a Structured Message (Generic Message type) using the Send API.
 *
 */
function sendGenericMessage(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "template",
                payload: {
                    template_type: "generic",
                    elements: [{
                        title: "rift",
                        subtitle: "Next-generation virtual reality",
                        item_url: "https://www.oculus.com/en-us/rift/",
                        image_url: SERVER_URL + "/assets/rift.png",
                        buttons: [{
                            type: "web_url",
                            url: "https://www.oculus.com/en-us/rift/",
                            title: "Open Web URL"
                        }, {
                            type: "postback",
                            title: "Call Postback",
                            payload: "Payload for first bubble",
                        }],
                    }, {
                        title: "touch",
                        subtitle: "Your Hands, Now in VR",
                        item_url: "https://www.oculus.com/en-us/touch/",
                        image_url: SERVER_URL + "/assets/touch.png",
                        buttons: [{
                            type: "web_url",
                            url: "https://www.oculus.com/en-us/touch/",
                            title: "Open Web URL"
                        }, {
                            type: "postback",
                            title: "Call Postback",
                            payload: "Payload for second bubble",
                        }]
                    }]
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
 * Send a receipt message using the Send API.
 *
 */
function sendReceiptMessage(recipientId) {
    // Generate a random receipt ID as the API requires a unique ID
    var receiptId = "order" + Math.floor(Math.random() * 1000);

    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "template",
                payload: {
                    template_type: "receipt",
                    recipient_name: "Peter Chang",
                    order_number: receiptId,
                    currency: "USD",
                    payment_method: "Visa 1234",
                    timestamp: "1428444852",
                    elements: [{
                        title: "Oculus Rift",
                        subtitle: "Includes: headset, sensor, remote",
                        quantity: 1,
                        price: 599.00,
                        currency: "USD",
                        image_url: SERVER_URL + "/assets/riftsq.png"
                    }, {
                        title: "Samsung Gear VR",
                        subtitle: "Frost White",
                        quantity: 1,
                        price: 99.99,
                        currency: "USD",
                        image_url: SERVER_URL + "/assets/gearvrsq.png"
                    }],
                    address: {
                        street_1: "1 Hacker Way",
                        street_2: "",
                        city: "Menlo Park",
                        postal_code: "94025",
                        state: "CA",
                        country: "US"
                    },
                    summary: {
                        subtotal: 698.99,
                        shipping_cost: 20.00,
                        total_tax: 57.67,
                        total_cost: 626.66
                    },
                    adjustments: [{
                        name: "New Customer Discount",
                        amount: -50
                    }, {
                        name: "$100 Off Coupon",
                        amount: -100
                    }]
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
 * Send a message with Quick Reply buttons.
 *
 */
function sendQuickReply(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            text: "What's your favorite movie genre?",
            metadata: "DEVELOPER_DEFINED_METADATA",
            quick_replies: [{
                "content_type": "text",
                "title": "Action",
                "payload": "DEVELOPER_DEFINED_PAYLOAD_FOR_PICKING_ACTION"
            }, {
                "content_type": "text",
                "title": "Comedy",
                "payload": "DEVELOPER_DEFINED_PAYLOAD_FOR_PICKING_COMEDY"
            }, {
                "content_type": "text",
                "title": "Drama",
                "payload": "DEVELOPER_DEFINED_PAYLOAD_FOR_PICKING_DRAMA"
            }]
        }
    };

    callSendAPI(messageData);
}

/*
 * Send a read receipt to indicate the message has been read
 *
 */
function sendReadReceipt(recipientId) {
    console.log("Sending a read receipt to mark message as seen");

    var messageData = {
        recipient: {
            id: recipientId
        },
        sender_action: "mark_seen"
    };

    callSendAPI(messageData);
}

/*
 * Turn typing indicator on
 *
 */
function sendTypingOn(recipientId) {
    console.log("Turning typing indicator on");

    var messageData = {
        recipient: {
            id: recipientId
        },
        sender_action: "typing_on"
    };

    callSendAPI(messageData);
}

/*
 * Turn typing indicator off
 *
 */
function sendTypingOff(recipientId) {
    console.log("Turning typing indicator off");

    var messageData = {
        recipient: {
            id: recipientId
        },
        sender_action: "typing_off"
    };

    callSendAPI(messageData);
}

/*
 * Send a message with the account linking call-to-action
 *
 */
function sendAccountLinking(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "template",
                payload: {
                    template_type: "button",
                    text: "Welcome. Link your account.",
                    buttons: [{
                        type: "account_link",
                        url: SERVER_URL + "/authorize"
                    }]
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
 * Call the Send API. The message data goes in the body. If successful, we'll 
 * get the message id in a response 
 *
 */
function callSendAPI(messageData) {
    request({
        uri: 'https://graph.facebook.com/v2.8/me/messages',
        qs: {
            access_token: PAGE_ACCESS_TOKEN
        },
        method: 'POST',
        json: messageData

    }, function(error, response, body) {
        if (!error && response.statusCode == 200) {
            var recipientId = body.recipient_id;
            var messageId = body.message_id;
        } else {
            console.error(response.error);
        }
    });
}

/*
 * render not found 404
 *
 */
app.get('*', function(req, res) {
    res.render('index');
});

// Start server
// Webhooks must be available via SSL with a certificate signed by a valid 
// certificate authority.
app.listen(app.get('port'), function() {
    console.log('Node app is running on port', app.get('port'));
});