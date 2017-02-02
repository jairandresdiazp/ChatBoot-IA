var ChatBoot = require("./ChatBoot.js");

module.exports = function(app, auth, DB) {
    /* 
     * product version.
     *
     */
    app.get('/version', function(req, res) {
        res.send({
            product: "API Boot-IA",
            version: "1.0.0",
            author: ["jair diaz", "jorge avendaño", "diana gomez"]
        });
    });

    /* 
     * index page.
     *
     */
    app.get('/app.js', function(req, res) {
        res.render('index');
    });

    /* 
     * policies use.
     *
     */
    app.get('/policies', function(req, res) {
        res.render('index');
    });

    /* 
     * terms use.
     *
     */
    app.get('/terms', function(req, res) {
        res.render('index');
    });

    /* 
     * guide if token user.
     *
     */
    app.get('/token', function(req, res) {
        res.render('token');
    });

    /*
     * WebJob
     *
     */

    app.get('/WebJob', auth, function(req, res) {
        ChatBoot.SendNotificationCitas(DB,function(result){
            res.send(result);
        });
    });
    
    /* 
     * policies use.
     *
     */
    app.get('/domotica', function(req, res) {
        res.render('domotica/index');
    });

    /*
     * webhookemail reciver email of console.context.io
     *
     */
    app.post('/webhookemail', function(req, res) {
        var WebHookEmail = DB.ref("WebHookEmail").push();
        var onComplete = function(error) {
            if (error) {
                console.log('Synchronization firebase failed');
                res.status(500).send({
                    status: "failed"
                });
            }else{
               res.send({
                    status: "webhookemail recived"
                }); 
            }
        };
        WebHookEmail.set({
            Acount: "Gmail",
            message: ""+req
        }, onComplete);
    });
};