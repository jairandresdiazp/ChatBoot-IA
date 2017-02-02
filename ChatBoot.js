  /* jshint node: true, devel: true */
  'use strict';

  const
      request = require('request'),
      config = require('config'),
      unirest = require("unirest");

  // Generate a page access token for your page from the App Dashboard
  const PAGE_ACCESS_TOKEN = (process.env.MESSENGER_PAGE_ACCESS_TOKEN) ?
      (process.env.MESSENGER_PAGE_ACCESS_TOKEN) :
      config.get('pageAccessToken');

  // URL where the app is running (include protocol). Used to point to scripts and 
  // assets located at this address. 
  const SERVER_URL = (process.env.SERVER_URL) ?
      (process.env.SERVER_URL) :
      config.get('serverURL');

  const USER_ELIBOM = (process.env.USER_ELIBOM) ?
      (process.env.USER_ELIBOM) :
      config.get('userElibom');

  const PASS_ELIBOM = (process.env.PASS_ELIBOM) ?
      (process.env.PASS_ELIBOM) :
      config.get('passElibom');

  const TOKEN_LENGTH = (process.env.TOKEN_LENGTH) ?
      (process.env.TOKEN_LENGTH) :
      config.get('tokenLength');

  var elibom = require('elibom')(USER_ELIBOM, PASS_ELIBOM);

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
  };

  var GetInfoPerson = function(DocumentNumber, res, error) {
      var request = unirest("GET", "http://pre.transfiriendo.com/SoatNetSEAPI/api/Contact/GetContact");
      var response;

      request.query({
          "DocumentType": "1",
          "DocumentNumber": DocumentNumber
      });

      request.headers({
          "authorization": "bearer 6E33B3621AF45C290893B8B7D1ACC44812EFEE40-5846809",
          "client": "5786"
      });

      request.end(function(result) {
          if (result.error) {
              error(result.error);
          } else {
              response = JSON.parse(result.body);
              response.Data = JSON.parse(response.Data);
              res(response);
          }
      });
  };

  var SendMessageInfoPerson = function(recipientId, Name, Phone) {
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
                          title: "Citas Programadas " + Name,
                          item_url: SERVER_URL,
                          subtitle: "su proxima cita es el Martes 17 de Noviembre",
                          buttons: [{
                              type: "postback",
                              title: "Confirmar",
                              payload: "00001"
                          }, {
                              type: "postback",
                              title: "Cancelar",
                              payload: "00002"
                          }]
                      }, {
                          title: "Telefono " + Phone,
                          item_url: "https://www.google.com.co/maps/place/Bogot%C3%A1/@4.6482837,-74.2478972,11z/data=!3m1!4b1!4m5!3m4!1s0x8e3f9bfd2da6cb29:0x239d635520a33914!8m2!3d4.7109886!4d-74.072092",
                          subtitle: "en la ubicacion",
                          buttons: [{
                              type: "postback",
                              title: "Confirmar",
                              payload: "00001"
                          }, {
                              type: "postback",
                              title: "Cancelar",
                              payload: "00002"
                          }]
                      }]
                  }
              }
          }
      };
      callSendAPI(messageData);
  };

  var SendMessageServices = function(recipientId) {
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
                          title: "Citas Programadas",
                          item_url: SERVER_URL,
                          subtitle: "Cobertura nacional",
                          buttons: [{
                              type: "web_url",
                              url: "http://www.compensar.com/salud/redUrgPOS.aspx",
                              title: "Ver"
                          }]
                      }, {
                          title: "Odontologia",
                          item_url: SERVER_URL,
                          subtitle: "Cobertura nacional",
                          buttons: [{
                              type: "web_url",
                              url: "http://www.compensar.com/salud/salud-oral-pos.aspx",
                              title: "Ver"
                          }]
                      }, {
                          title: "Laboratorio",
                          item_url: SERVER_URL,
                          subtitle: "Cobertura nacional",
                          buttons: [{
                              type: "web_url",
                              url: "http://www.compensar.com/salud/labCli_POS.aspx",
                              title: "Ver"
                          }]
                      }, {
                          title: "Cirujia estetica",
                          item_url: SERVER_URL,
                          subtitle: "Cobertura nacional",
                          buttons: [{
                              type: "web_url",
                              url: "http://www.compensar.com/salud/estetica.aspx",
                              title: "Ver"
                          }]
                      }, {
                          title: "Vacunacion",
                          item_url: SERVER_URL,
                          subtitle: "Cobertura nacional",
                          buttons: [{
                              type: "web_url",
                              url: "http://www.compensar.com/salud/vacunas.aspx",
                              title: "Ver"
                          }]
                      }, {
                          title: "Afiliacion",
                          item_url: SERVER_URL,
                          subtitle: "Cobertura nacional",
                          buttons: [{
                              type: "web_url",
                              url: "http://www.compensar.com/salud/insAfiTraDep.aspx",
                              title: "Ver"
                          }]
                      }]
                  }
              }
          }
      };
      callSendAPI(messageData);
  };

  var GetInfoPersonFacebook = function(recipientId, response) {
      var request = unirest("GET", "https://graph.facebook.com/v2.6/" + recipientId);

      request.query({
          "fields": "first_name,last_name,gender",
          "access_token": PAGE_ACCESS_TOKEN
      });

      request.end(function(result) {
          if (result.error) {
              console.log(result.error);
          } else {
              result = JSON.parse(result.body);
              response(result);
          }
      });
  };

  var SendMessageInvoicePerson = function(recipientId, Name, URL) {
      var messageData = {
          recipient: {
              id: recipientId
          },
          message: {
              attachment: {
                  type: "template",
                  payload: {
                      template_type: "button",
                      text: "Facturas para " + Name,
                      buttons: [{
                          type: "web_url",
                          url: URL,
                          title: "Ver factura"
                      }]
                  }
              }
          }
      };
      callSendAPI(messageData);
  };

  var SendMessageToken = function(Phone, Name, callback) {
      var token = Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, TOKEN_LENGTH).toUpperCase();
      elibom.sendMessage(Phone, 'Estimado/a ' + Name + ' su token de seguridad es ' + token, function(err, data) {
          if (!err) {
              console.log(data);
              callback(null, token);
          } else {
              console.log(err.message);
              callback(err, token);
          }
      });
  };

  var SendNotificationCitas = function(DB, callback) {
      var Person = DB.ref("Person");
      var DataPersons;
      Person.on("value", function(data) {
          DataPersons = data.val();
          var IndexPerson = Object.keys(DataPersons);
          for (var index = 0; index < IndexPerson.length; index++) {
              var DataPerson = DataPersons[IndexPerson[index]];
              SendMessageInfoPerson(DataPerson.ID, DataPerson.FirtsName + " " + DataPerson.FirtsName, "151515155");
          }
      }, function(error) {
          console.log("The read failed: " + error);
      });
      callback({
          Message: "WebJob it's running"
      });
  };

  module.exports.GetInfoPerson = GetInfoPerson;
  module.exports.SendMessageInfoPerson = SendMessageInfoPerson;
  module.exports.SendMessageServices = SendMessageServices;
  module.exports.GetInfoPersonFacebook = GetInfoPersonFacebook;
  module.exports.SendMessageInvoicePerson = SendMessageInvoicePerson;
  module.exports.SendMessageToken = SendMessageToken;
  module.exports.SendNotificationCitas = SendNotificationCitas;