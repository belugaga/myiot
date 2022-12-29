var AWS = require("aws-sdk");
var bucketVerification = "my-iot-pics-verification"; //not need to touch
var imageVerification = "timcook.jpg"; //required for verificatio (found in database)

var bucketToVerify = "my-iot-pics-taken"; //not need to touch
var imageToVerify = "me.jpg"; //required for verification (taken by iot device)

randomIntA = Math.round(Math.random() * 10); //number of alcohol purchased
var alcoholQty = randomIntA; // stimulate obtaining POS system output
console.log("Number of alcohol to pruchase from POS system is", randomIntA);

randomIntT = Math.round(Math.random() * 10); //number of tobacco purchased
var tobaccoQty = randomIntT; //stimulate obtaining POS system output
console.log("Number of tobacco to purchase from POS system is", randomIntT);

AWS.config.update({
  accessKeyId: "AKIA2I7GWLT3M6YMHRPJ",
  secretAccessKey: "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",
  region: "us-east-1",
}); //access keys to allow access to AWS account

// Create S3 service object
var s3 = new AWS.S3();

//function of deleting photos taken from S3
function deletePhoto() {
  var deleteparams = {
    Bucket: bucketToVerify, //bucket to store images temporarily
    Key: imageToVerify, //image to delete
  };

  //deleting an S3 object which is the photo taken by camera (iot sensor)
  s3.deleteObject(deleteparams, function (err, data) {
    if (err) console.log(err, err.stack); // an error occurred
    else console.log("camera session ended", data); // successful response
  });
}

var fs = require("fs");
// Read the file
const file = fs.readFileSync("images/" + imageToVerify);

// Setting up S3 upload parameters
const uploadParams = {
  Bucket: bucketToVerify, // Bucket into which you want to upload file
  Key: imageToVerify, // Name by which you want to save it
  Body: file, // Local file
};

//uploading of taken images to S3 bucket taken photo
s3.upload(uploadParams, function (err, data) {
  if (err) {
    console.log("Error", err); //fail message
  }
  if (data) {
    console.log("Upload Success", data.Location); //success message

    var compareparams = {
      TargetImage: {
        S3Object: {
          Bucket: bucketVerification,
          Name: imageVerification,
        },
      },
      SourceImage: {
        S3Object: {
          Bucket: bucketToVerify,
          Name: imageToVerify,
        },
      },
      SimilarityThreshold: 0,
    }; //params for rekognition compareFaces

    const rekognition = new AWS.Rekognition(); //access to AWS rekogntion service

    if (alcoholQty != 0 || tobaccoQty != 0) {
      rekognition.compareFaces(compareparams, function (err, result) {
        if (err) {
          console.log(err, err.stack); //error
        } else { //success
          similarityValue = result.FaceMatches[0].Similarity; //obtaining similarity value

          if (similarityValue >= 95) {
            var getparams = {
              Image: {
                S3Object: {
                  Bucket: bucketVerification,
                  Name: imageVerification,
                },
              }, //getparams for rekognition recognizeCelebrities
            };

            rekognition.recognizeCelebrities(getparams, function (err, info) {
              if (err) {
                console.log(err, err.stack);
              } else {
                console.log(
                  "array for unrecognised faces is ",
                  info.UnrecognizedFaces.length
                );
                var unrecognisedLevel = info.UnrecognizedFaces.length;

                if (unrecognisedLevel == 0) {
                  //simulating if picture is found in the database
                  var identityName = info.CelebrityFaces[0].Name;
                  var identityNumber = info.CelebrityFaces[0].Id;

                  var detectparams = {
                    Image: {
                      S3Object: {
                        Bucket: bucketToVerify,
                        Name: imageToVerify,
                      },
                    }, //detectparams for rekognition detectFaces
                    Attributes: ["ALL"],
                  };

                  rekognition.detectFaces(detectparams, function (err, data) {
                    if (err) {
                      console.log(err, err.stack);
                    } else {
                      var ageValue = data.FaceDetails[0].AgeRange.Low;
                      var confidenceLevel = data.FaceDetails[0].Confidence;

                      console.log("identity name @ iot site is ", identityName);
                      console.log(
                        "identity number @ iot site is ",
                        identityNumber
                      );
                      console.log("age @ iot site is ", ageValue);

                      //AWS IOT site
                      var awsIot = require("aws-iot-device-sdk");

                      var device = awsIot.device({
                        keyPath: "./certs/private.pem.key",
                        certPath: "./certs/device-certificate.pem.crt",
                        caPath: "./certs/AmazonRootCA1.pem",
                        clientId: "first-try",
                        host: "a3jwlzur1lbx3d-ats.iot.us-east-1.amazonaws.com",
                      }); //declaring IoT device info

                      var current = new Date(); //today's date
                      var epochtime = Math.floor(
                        current.getTime() / 1000 + 31536000
                      ); //converting time to seconds

                      device.on("connect", function () {
                        console.log("connect");
                        device.subscribe("topic_1"); // subscribe topic_1
                        device.publish(
                          "topic_1",
                          JSON.stringify({
                            transaction_id: Date.now().toString(),
                            time: current,
                            alcohol_purchased: alcoholQty,
                            tobacco_purchased: tobaccoQty,
                            device_id: 1,
                            name: identityName,
                            nric: identityNumber,
                            age: ageValue,
                            confidence: confidenceLevel,
                            ttl: epochtime, //ttl is epochtime is set for expiry of data row after 1 year from above
                          })
                        );
                      });

                      device.on("message", function (topic, payload) {
                        console.log("message", topic, payload.toString());
                      });
                      deletePhoto(); //calling deletePhoto function after success run
                    }
                  });
                } else {
                  console.log("inaccurate... not in database");
                  deletePhoto(); //calling deletePhoto function after failed run
                }
              }
            });
          } else {
            console.log("not verified");
            deletePhoto(); //calling deletePhoto function after failed run
          }
        }
      });
    } else {
      console.log("no age-restricted products found");
      deletePhoto(); //calling deletePhoto function after failed run
    }
  }
});
