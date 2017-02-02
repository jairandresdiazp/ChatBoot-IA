var unirest = require("unirest");

var request = unirest("GET", "https://chatboot-ia.azurewebsites.net/webjob");

request.headers({
  "authorization": "Basic amRpYXo6amRpYXo="
});

request.end(function(result) {
	if (result.error){
		console.log(result.error);
	}else{
		result = result.body;
		console.log(result);		
	}
});