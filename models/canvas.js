var config = require('../bin/config');
var auth = require('../bin/auth');
var request = require('request');
var asyncStuff = require('async');
var mongo = require('./mongo');

var add_page_number = (url) => {
  if(url.indexOf("?")>-1){
    return url+'&per_page='+String(config.canvasPageResults);
  } else{
    return url+'?per_page='+String(config.canvasPageResults);
  }
}

var assignment_user_url = (studentID, courseID) => {
  return config.canvasURL + '/api/v1/courses/' + courseID + '/students/submissions?student_ids[]=' + studentID
}

var notes_column_url = (courseID) => {
  var url_res = config.canvasURL + '/api/v1/courses/' + courseID + '/custom_gradebook_columns/';
  console.log("URL RESULTS");
  console.log(url_res);
  return url_res;
}

var get_update_url = (courseID, callback) => {    
  // getAdminRequest(notes_column_url(courseID),function(err,custom_columns){
  //   var points_id = custom_columns.find(column => column.title='Notes').id;
  //   var update_url = config.canvasURL + '/api/v1/courses/' + courseID + '/custom_gradebook_columns/' + points_id + '/data';
  //   callback(update_url);
  // });
}

var sections_url = (courseID) => {
  return config.canvasURL + '/api/v1/courses/' + courseID + '/sections?include=students';
}

var student_url = (courseID) => {
  return config.canvasURL + '/api/v1/courses/' + courseID + '/users?enrollment_type=student';
}

var daily_yalie_url = (courseID) => {
  return config.canvasURL + '/api/v1/courses/'+ courseID+ '/assignments?search_term=Daily';
}

function getRequest(url, userID, callback) {
  url = add_page_number(url);
  auth.authTokenQueue.push(userID,function(auth_token){
    request.get({
      url: url,
      headers: {
        "Authorization": " Bearer " + auth_token,
      },
    }, function(error, response, body) {
      callback(null, JSON.parse(body));
    });
  });
} //user GET request

function postRequest(url, userID, parameters, callback) {
  url = add_page_number(url);
  auth.authTokenQueue.push(userID,function(auth_token){
    request.post({
      url: url,
      headers: {
        "Authorization": " Bearer " + auth_token,
      },
      form: parameters,
    }, function(error, response, body) {
      callback(null, JSON.parse(body));
    });
  });
} //user POST request

function putRequest(url, userID, parameters, callback) {
  url = add_page_number(url);
  auth.authTokenQueue.push(userID,function(auth_token){
    request.put({
      url: url,
      headers: {
        "Authorization": " Bearer " + auth_token,
      },
      form: parameters,
    }, function(error, response, body) {
      callback(null, JSON.parse(body));
    });
  });
} //user PUT request

function getAdminRequest(url, callback) {
  url = add_page_number(url);
  request.get({
    url: url,
    headers: {
      "Authorization": " Bearer " + config.canvasAdminAuthToken
    },
  }, function(error, response, body) {
    callback(null, JSON.parse(body));
  });
} //admin GET request

function postAdminRequest(url, parameters, callback) {
  url = add_page_number(url);
  request.post({
    url: url,
    headers: {
      "Authorization": " Bearer " + config.canvasAdminAuthToken
    },
    form: parameters,
  }, function(error, response, body) {
    callback(null, JSON.parse(body));
  });
} //admin POST request

function putAdminRequest(url, parameters, callback) {
  url = add_page_number(url);
  request.put({
    url: url,
    headers: {
      "Authorization": " Bearer " + config.canvasAdminAuthToken
    },
    form: parameters,
  }, function(error, response, body) {
    callback(null, JSON.parse(body));
  });
} //admin PUT request

function computeScoreAndBadges(studentID, courseID, callback){ // Return score and badges
  mongo.getAllData(courseID,function(mongo_data){
    var badges = mongo_data.badges;
    var totalPoints = 0;
    var practice_proficient = 0;
    var quizzes_attempted = 0;
    var daily_done = 0;
    var reflections_done = 0;

    //lucky bulldog
    lucky_bulldog_points = 100;
    var d = new Date();

    if (mongo_data.lucky_bulldogs.length>0){
      for (lucky_bulldog of mongo_data.lucky_bulldogs){
        console.log(lucky_bulldog);
        //student already was awarded lucky bulldog
        if(lucky_bulldog.awarded_ids.length>0){
          if (lucky_bulldog.awarded_ids.includes(studentID)){
            totalPoints += parseInt(lucky_bulldog_points);
          }
          else if (((d.getTime() - Date.parse(lucky_bulldog.time))/(1000*60))<1){
            totalPoints += parseInt(lucky_bulldog_points);
            lucky_bulldog.awarded_ids.push(studentID);
            mongo.updateData(courseID,'lucky_bulldogs',{ _id: parseInt(lucky_bulldog._id) },{awarded_ids: lucky_bulldog.awarded_ids}, function(err,result){});  
          }
        } else if (((d.getTime() - Date.parse(lucky_bulldog.time))/(1000*60))<1){
          totalPoints += parseInt(lucky_bulldog_points);
          lucky_bulldog.awarded_ids.push(studentID);
          mongo.updateData(courseID,'lucky_bulldogs',{ _id: parseInt(lucky_bulldog._id) },{awarded_ids: lucky_bulldog.awarded_ids}, function(err,result){});
        }
      }
    }
    
    function awardBadge(badgeID) {
      badge_info = mongo_data.badges.find(badge => badge._id == badgeID);
      totalPoints += parseInt(badge_info.Points);
      badges[badges.indexOf(badge_info)].Awarded = true;
    }

    function sortLeaderboardScores(a,b) {
      if (a.score < b.score)
        return 1;
      if (a.score > b.score)
        return -1;
      return 0;
    }

    getRequest(assignment_user_url(studentID, courseID),studentID, function(err, data) {
      if (err){
        console.log(err);
        callback(err, 0, badges);
      } else if (data.status == "unauthorized"){
        console.log('User unauthorized');
        callback('User unauthorized', 0, badges);
      } else if (data.error){
        console.log(data.error);
        callback(data.error, 0, badges);
      } else if (data.length<1) {
        console.log('No Assignment Data Recorded');
        callback(null, 0, badges);
      } else {
        //Daily Yalie questions
        for (var i = 0; i < mongo_data.dailies.length; i++) {
          var daily_object = data.find(daily => daily.assignment_id == (mongo_data.dailies[i]).assignment_id);
          if (daily_object){
            var daily_grade = parseFloat(daily_object.grade);
            if (daily_grade == parseFloat(100)) {
              daily_done += 1
            }
          }
        }
        totalPoints += (parseInt(daily_done) * 50); //assign points for each daily
        //assign points for each badge earned
        if (daily_done >= 1) {
          awardBadge(1);
        }
        if (daily_done >= 5) {
          awardBadge(2);
        }
        if (daily_done >= 10) {
          awardBadge(3);
        }
        if (daily_done >= 15) {
          awardBadge(4);
        }
        if (daily_done >= 20) {
          awardBadge(5);
        }
        if (daily_done >= 25) {
          awardBadge(6);
        }

        for (var i = 0; i < mongo_data.modules.length; i++) {
          if (mongo_data.modules[i].open=='true'){
                    
            //practice objectives proficient
            var practice_object = data.find(assignment => assignment.assignment_id == (mongo_data.modules[i]).practice_link);
            if (practice_object){
              var practice_grade = parseFloat(practice_object.grade);
              if (practice_grade >= parseFloat(mongo_data.modules[i].practice_cutoff)) {

                practice_proficient += 1;

                //Process Practice Early Bird Badge
                if(mongo_data.modules[i].leaderboard.practice_early_bird == ""){
                  mongo_data.modules[i].leaderboard.practice_early_bird = studentID.toString();
                  awardBadge(26);
                  } else {
                  if (mongo_data.modules[i].leaderboard.practice_early_bird == studentID.toString()){
                    awardBadge(26);
                  }
                }

                //Process Practice Leaderboard

                if(mongo_data.modules[i].leaderboard.practice_leaderboard.find(placement => placement.student_id==studentID)){
                  //user is already on leaderboard
                  awardBadge(20);
                  user_index =  mongo_data.modules[i].leaderboard.practice_leaderboard.findIndex(placement => placement.student_id==studentID)
                  mongo_data.modules[i].leaderboard.practice_leaderboard[user_index] = {
                    'student_id': studentID.toString(),
                    'score': practice_grade
                  }
                  mongo_data.modules[i].leaderboard.practice_leaderboard = mongo_data.modules[i].leaderboard.practice_leaderboard.sort(sortLeaderboardScores)
                  if(mongo_data.modules[i].leaderboard.practice_leaderboard.findIndex(placement => placement.student_id==studentID)==0){
                    //user is top on leaderboard
                    awardBadge(21);
                  }

                } else {
                  // Process leaderboard if not full - add user automatically
                  if(mongo_data.modules[i].leaderboard.practice_leaderboard.length<10){
                    mongo_data.modules[i].leaderboard.practice_leaderboard.push({
                      'student_id': studentID.toString(),
                      'score': practice_grade
                    });
                    awardBadge(20);
                    mongo_data.modules[i].leaderboard.practice_leaderboard = mongo_data.modules[i].leaderboard.practice_leaderboard.sort(sortLeaderboardScores)
                    if(mongo_data.modules[i].leaderboard.practice_leaderboard.findIndex(placement => placement.student_id==studentID)==0){
                      //user is top on leaderboard
                      awardBadge(21);
                    }
                  } else {
                    //user not on full leaderboard - compare scores and update
                    mongo_data.modules[i].leaderboard.practice_leaderboard = mongo_data.modules[i].leaderboard.practice_leaderboard.sort(sortLeaderboardScores)
                    if (practice_grade > mongo_data.modules[i].leaderboard.practice_leaderboard[mongo_data.modules[i].leaderboard.practice_leaderboard.length-1].score){
                      mongo_data.modules[i].leaderboard.practice_leaderboard.pop()
                      mongo_data.modules[i].leaderboard.practice_leaderboard.push({
                        'student_id': studentID.toString(),
                        'score': practice_grade
                      });
                      awardBadge(20);
                      mongo_data.modules[i].leaderboard.practice_leaderboard = mongo_data.modules[i].leaderboard.practice_leaderboard.sort(sortLeaderboardScores)
                      if(mongo_data.modules[i].leaderboard.practice_leaderboard.findIndex(placement => placement.student_id==studentID)==0){
                        //user is top on leaderboard
                        awardBadge(21);
                      }
                    }
                  }
                }
              }
            }

            //quizzes attempted
            var quiz_object = data.find(assignment => assignment.assignment_id == (mongo_data.modules[i]).quiz_link);
            if (quiz_object){
              var quiz_grade = parseFloat(quiz_object.grade);
              if (quiz_grade > parseFloat(0)) {
                quizzes_attempted += 1;

                //Process Quiz Early Bird Badge                
                if(mongo_data.modules[i].leaderboard.quiz_early_bird == ""){
                  mongo_data.modules[i].leaderboard.quiz_early_bird = studentID.toString();
                  awardBadge(24);
                  mongo.updateData(courseID,'modules',{_id:(mongo_data.modules[i])._id},mongo_data.modules[i],
                    function(err,result){});
                  } else {
                  if (mongo_data.modules[i].leaderboard.quiz_early_bird == studentID.toString()){
                    awardBadge(24);
                  }
                }

                //Process Quiz Leaderboard

                if(mongo_data.modules[i].leaderboard.quiz_leaderboard.find(placement => placement.student_id==studentID)){
                  //user is already on leaderboard
                  awardBadge(22);
                  user_index =  mongo_data.modules[i].leaderboard.quiz_leaderboard.findIndex(placement => placement.student_id==studentID)
                  mongo_data.modules[i].leaderboard.quiz_leaderboard[user_index] = {
                    'student_id': studentID.toString(),
                    'score': quiz_grade
                  }
                  mongo_data.modules[i].leaderboard.quiz_leaderboard = mongo_data.modules[i].leaderboard.quiz_leaderboard.sort(sortLeaderboardScores)
                  if(mongo_data.modules[i].leaderboard.quiz_leaderboard.findIndex(placement => placement.student_id==studentID)==0){
                    //user is top on leaderboard
                    awardBadge(23);
                  }

                } else {
                  // Process leaderboard if not full - add user automatically
                  if(mongo_data.modules[i].leaderboard.quiz_leaderboard.length<10){
                    mongo_data.modules[i].leaderboard.quiz_leaderboard.push({
                      'student_id': studentID.toString(),
                      'score': quiz_grade
                    });
                    awardBadge(22);
                    mongo_data.modules[i].leaderboard.quiz_leaderboard = mongo_data.modules[i].leaderboard.quiz_leaderboard.sort(sortLeaderboardScores)
                    if(mongo_data.modules[i].leaderboard.quiz_leaderboard.findIndex(placement => placement.student_id==studentID)==0){
                      //user is top on leaderboard
                      awardBadge(23);
                    }
                  } else {
                    //user not on full leaderboard - compare scores and update
                    mongo_data.modules[i].leaderboard.quiz_leaderboard = mongo_data.modules[i].leaderboard.quiz_leaderboard.sort(sortLeaderboardScores)
                    if (quiz_grade > mongo_data.modules[i].leaderboard.quiz_leaderboard[mongo_data.modules[i].leaderboard.quiz_leaderboard.length-1].score){
                      mongo_data.modules[i].leaderboard.quiz_leaderboard.pop()
                      mongo_data.modules[i].leaderboard.quiz_leaderboard.push({
                        'student_id': studentID.toString(),
                        'score': quiz_grade
                      });
                      awardBadge(22);
                      mongo_data.modules[i].leaderboard.quiz_leaderboard = mongo_data.modules[i].leaderboard.quiz_leaderboard.sort(sortLeaderboardScores)
                      if(mongo_data.modules[i].leaderboard.quiz_leaderboard.findIndex(placement => placement.student_id==studentID)==0){
                        //user is top on leaderboard
                        awardBadge(23);
                      }
                    }
                  }
                }
              }
            }

            //number of reflections
            var reflection_object = data.find(assignment => assignment.assignment_id == (mongo_data.modules[i]).reflection_link);
            if(reflection_object){
              var reflection_grade = parseFloat(reflection_object.grade);
              if (reflection_grade == parseFloat(100)) {
                reflections_done += 1;
                
                //Process Reflection Early Bird Badge 
                if(mongo_data.modules[i].leaderboard.reflection_early_bird == ""){
                  mongo_data.modules[i].leaderboard.reflection_early_bird = studentID.toString();
                  awardBadge(25);
                  mongo.updateData(courseID,'modules',{_id:(mongo_data.modules[i])._id},mongo_data.modules[i],
                    function(err,result){});
                  } else {
                  if (mongo_data.modules[i].leaderboard.reflection_early_bird == studentID.toString()){
                    awardBadge(25);
                  }
                }
              }
            }
            mongo.updateData(courseID,'modules',{_id:(mongo_data.modules[i])._id},mongo_data.modules[i],function(err,result){});
          } 
        }


        totalPoints += (parseInt(practice_proficient) * 100); //assign points for each proficient ALEKS 
        //assign points for each badge earned
        if (practice_proficient >= 1) {
          awardBadge(7);
        }
        if (practice_proficient >= 3) {
          awardBadge(8);
        }
        if (practice_proficient >= 7) {
          awardBadge(9);
        }
        if (practice_proficient >= 10) {
          awardBadge(10);
        }

       
        totalPoints += (parseInt(quizzes_attempted) * 100); //assign points for each quiz
        //assign points for each badge earned
        if (quizzes_attempted >= 1) {
          awardBadge(11);
        }
        if (quizzes_attempted >= 3) {
          awardBadge(12);
        }
        if (quizzes_attempted >= 7) {
          awardBadge(13);
        }
        if (quizzes_attempted >= 10) {
          awardBadge(14);
        }

        totalPoints += (parseInt(reflections_done) * 100);
        //assign points for each badge earned
        if (reflections_done >= 1) {
          awardBadge(28);
        }
        if (reflections_done >= 3) {
          awardBadge(29);
        }
        if (reflections_done >= 7) {
          awardBadge(30);
        }
        if (reflections_done >= 10) {
          awardBadge(31);
        }


        callback(null, totalPoints, badges);
      }

    });
  });
}

function updateCanvas(studentID, courseID, totalPoints, badges, callback) { // Update Canvas custom points column
  get_update_url(courseID, function(update_url){
    update_url = update_url + '/' + studentID;
    putAdminRequest(update_url, {
      column_data: {
        content: totalPoints.toString()
      }
    }, function(err, body) {
      callback(null, totalPoints, badges);
    });
  });
}

function getIndScoreAndBadges(studentID, courseID, callback){ // Get score and badge info for user
    computeScoreAndBadges(studentID, courseID, function(err, totalPoints, badges){ //compute scores
        updateCanvas(studentID, courseID, totalPoints, badges, callback); //update Canvas
    });
}

function getStudentProgress(studentID, courseID, callback) { // Get student progress for quizzes and tests (checkboxes)
  mongo.getAllData(courseID,function(mongo_data){
    getRequest(assignment_user_url(studentID, courseID), studentID, function(err, user_assigments) {
      moduleProgress = mongo_data.modules;
      if (err){
        console.log(err);
        callback(null, moduleProgress);
      } else if (user_assigments.status == "unauthorized"){
        console.log('User unauthorized');
        callback(null, moduleProgress);
      } else if (user_assigments.error>0){
        console.log(data.error);
        callback(null, 0, moduleProgress);
      } else if (user_assigments.length<1) {
        console.log('No User Assignments recorded');
        callback(null, moduleProgress);
      } else {
        //get quiz and aleks progress
        for (var i = 0; i < moduleProgress.length; i++) {
          var module_object = mongo_data.modules.find(module => module._id == i + 1);

          // if (module_object.new_practice_cutoff_format_true == 'true')
          // {
          //   console.log("module_object.new_practice_cutoff_format_true");
          //   const practiceId_cutoff_obj = (array =>
          //     array.reduce((obj, x) => {
          //       obj[x.substring(0, x.indexOf(':')).trim()] = parseInt(x.substring(x.indexOf(':')+1));
          //       return obj
          //     }, {}))(module_object.new_practice_cutoff.split(';'));
              
          //   const practice_objects = Object.keys(practiceId_cutoff_obj).map(practice_id => user_assigments.find(assignment => assignment.assignment_id == parseInt(practice_id)));
            
          //   if(practice_objects
          //     .every(practice_object => parseFloat(practice_object.grade) >= parseFloat(practiceId_cutoff_obj[practice_object.assignment_id + '']))){
          //       (moduleProgress[i]).practice_progress = true;
          //     } else {
          //       (moduleProgress[i]).practice_progress = false;
          //     }

          // } else{
          //   if (!module_object.multiple_practices) {
          //     const practice_object = user_assigments.find(assignment => assignment.assignment_id == module_object.practice_link);
          //     console.log("practice_object", practice_object)
          //     if(practice_object){
          //       (moduleProgress[i]).practice_progress = parseFloat(practice_object.grade) >= parseFloat(module_object.practice_cutoff);
          //     } else {
          //       (moduleProgress[i]).practice_progress = false;
          //     }
          //   } else {
          //     const practice_objects = module_object.multiple_practice_links.map(link_id => user_assigments.find(assignment => assignment.assignment_id == link_id));
          //     console.log("practice_object", practice_objects)
          //     if(practice_objects
          //     .every(practice_object => parseFloat(practice_object.grade) >= parseFloat(module_object.practice_cutoff))){
          //       (moduleProgress[i]).practice_progress = true;
          //     } else {
          //       (moduleProgress[i]).practice_progress = false;
          //     }
          //   }
          // }

          const practiceId_cutoff_obj = (array =>
            array.reduce((obj, x) => {
              obj[x.substring(0, x.indexOf('_')).trim()] = parseInt(x.substring(x.indexOf('_')+1).trim());
              return obj
            }, {}))(module_object.multiple_practice_cutoff.trim().split(','));
            
          const practice_objects = Object.keys(practiceId_cutoff_obj).map(practice_id => user_assigments.find(assignment => assignment.assignment_id == parseInt(practice_id)));
            
          if(practice_objects
            .every(practice_object => parseFloat(practice_object.grade) >= parseFloat(practiceId_cutoff_obj[practice_object.assignment_id + '']))){
              (moduleProgress[i]).practice_progress = true;
            } else {
              (moduleProgress[i]).practice_progress = false;
            }

          //quiz progress
          var quiz_object = user_assigments.find(assignment => assignment.assignment_id == module_object.quiz_link);
          if(quiz_object){
            (moduleProgress[i]).quiz_progress = parseFloat(quiz_object.grade) >= parseFloat(module_object.quiz_cutoff);
          } else {
            (moduleProgress[i]).quiz_progress = false;
          }
          

        
        }
        callback(null, moduleProgress);
      }
    });
  });
}

function getLeaderboardScores(studentID, courseID, callback) { // get all leaderboard scores

  function mergeLeaderboardArrays(groupNames, scores) { //merge name and score arrays for leaderboard
    var combinedArray = []
    for (var i = 0; i < groupNames.length; i++) {
      combinedArray.push({
        'Name': groupNames[i],
        'Score': scores[i]
      })
    }
    if (groupNames.length < 3){
      fillerArray = Array(3-groupNames.length).fill({'Name': '','Score': 0});
      combinedArray = combinedArray.concat(fillerArray);
    }
    return combinedArray
  }

  asyncStuff.waterfall([
    getSections,
    getTotalScores,
  ], function(err, scores, groupNames, studentIndex) {
    function compare(a, b) {
      if (a.Score < b.Score) return 1;
      if (a.Score > b.Score) return -1;
      return 0;
    }

    callback(err, mergeLeaderboardArrays(groupNames, scores).sort(compare), mergeLeaderboardArrays(groupNames, scores)[parseInt(studentIndex)]);
  });

  function getSections(callback){
    function findIndexOfUser(studentIdsArrays) {
      for (var i = 0; i < studentIdsArrays.length; i++) {
        var index = studentIdsArrays[i].indexOf(parseInt(studentID));
        if (index > -1) {
          return i
        }
      }
    }

    getAdminRequest(sections_url(courseID),function(err,data){
      // remove section with all students
      for (var i = 0; i < data.length; i++) {
        if(data[i].students==null){ 
          data.splice(i, 1);
        }
      }
      if (data.length<1 || config.disableLeaderboard){ //disable leaderboard until sections are made
        callback(null,[],[],0);
      } else {
        groupNames = data.map(section => section.name);
        studentIdsArrays = data.map(section => section.students.map(studentInfo => studentInfo.id));
        studentIndex = findIndexOfUser(studentIdsArrays);
        callback(null, studentIdsArrays, groupNames, studentIndex)
      }
    });
  }

  
  function getTotalScores(studentIdsArrays, groupNames, studentIndex, callback2) {
    get_update_url(courseID, function(update_url){
      getAdminRequest(update_url, function(err, pointsInfo) {
        function getPointValue(studentID) {
          try {
            return parseInt((pointsInfo.find(studentInfo => studentInfo.user_id == studentID)).content);
          } catch (e) {
            return 0;
          }
        }
        var studentPoints = studentIdsArrays.map(studentIds => ((studentIds.map(studentId => getPointValue(studentId))).reduce((a, b) => a + b, 0)));
        callback2(null, studentPoints, groupNames, studentIndex);
      });
    })
  }
}

function getAdminLeaderboardScores(courseID, callback){
  function mergeLeaderboardArrays(groupNames, scores) { //merge name and score arrays for leaderboard
    var combinedArray = []
    for (var i = 0; i < groupNames.length; i++) {
      combinedArray.push({
        'Name': groupNames[i],
        'Score': scores[i]
      })
    }
    if (groupNames.length < 3){
      fillerArray = Array(3-groupNames.length).fill({'Name': '','Score': 0});
      combinedArray = combinedArray.concat(fillerArray);
    }
    return combinedArray
  }

  asyncStuff.waterfall([
    getSections,
    getTotalScores,
  ], function(err, scores, groupNames) {
    function compare(a, b) {
      if (a.Score < b.Score) return 1;
      if (a.Score > b.Score) return -1;
      return 0;
    }
    callback(err, mergeLeaderboardArrays(groupNames, scores).sort(compare));
  });

  function getSections(callback){
    getAdminRequest(sections_url(courseID),function(err,data){

      // remove section with all students
      for (var i = 0; i < data.length; i++) {
        if(data[i].students==null){ 
          data.splice(i, 1);
        }
      }
      if (data.length<1 || config.disableLeaderboard){ // disable leaderboard until sections are made
        callback(null,[],[]);
      } else {
        groupNames = data.map(section => section.name);
        studentsArray = data.map(section => section.students);
        studentIdsArrays = data.map(section => section.students.map(studentInfo => studentInfo.id));
        callback(null, studentIdsArrays, groupNames);
      }
    });
  }

  function getTotalScores(studentIdsArrays, groupNames, callback2) {
    get_update_url(courseID, function(update_url){
      getAdminRequest(update_url, function(err, pointsInfo) {
        function getPointValue(studentID) {
          try {
            return parseInt((pointsInfo.find(studentInfo => studentInfo.user_id == studentID)).content);
          } catch (e) {
            return 0;
          }
        }
        var studentPoints = studentIdsArrays.map(studentIds => ((studentIds.map(studentId => getPointValue(studentId))).reduce((a, b) => a + b, 0)));
        callback2(null, studentPoints, groupNames);
      });
    })
  }
}

function getStudents(courseID, callback){
  getAdminRequest(student_url(courseID),function(err,student_data){
    var student_data_sorted = student_data.sort(function(a, b) {
      var textA = a.sortable_name.toUpperCase();
      var textB = b.sortable_name.toUpperCase();
      return (textA < textB) ? -1 : (textA > textB) ? 1 : 0;
    });
    callback(err,student_data_sorted);
  });
}

function getNextDailyYalie(courseID, callback){
  getAdminRequest(daily_yalie_url(courseID), function(err,dailies_data){
    var closest = Infinity;
    dailies_data.forEach(function(daily) {
      if (new Date(daily.due_at) >= new Date() && new Date(daily.due_at) < closest) {
          closest = daily;
      }
    });
    callback(null,closest);
  });
}

function computeScoreAndBadges_masquerade(studentID, courseID, callback){ // Return score and badges
  mongo.getAllData(courseID,function(mongo_data){
    var badges = mongo_data.badges;
    var totalPoints = 0;
    var practice_proficient = 0;
    var quizzes_attempted = 0;
    var daily_done = 0;
    var reflections_done = 0;

    //lucky bulldog
    lucky_bulldog_points = 100;
    var d = new Date();

    if (mongo_data.lucky_bulldogs.length>0){
      for (lucky_bulldog of mongo_data.lucky_bulldogs){
        console.log(lucky_bulldog);
        //student already was awarded lucky bulldog
        if(lucky_bulldog.awarded_ids.length>0){
          if (lucky_bulldog.awarded_ids.includes(studentID)){
            totalPoints += parseInt(lucky_bulldog_points);
          }
        } 
      }
    }
    
    function awardBadge(badgeID) {
      badge_info = mongo_data.badges.find(badge => badge._id == badgeID);
      totalPoints += parseInt(badge_info.Points);
      badges[badges.indexOf(badge_info)].Awarded = true;
    }

    function sortLeaderboardScores(a,b) {
      if (a.score < b.score)
        return 1;
      if (a.score > b.score)
        return -1;
      return 0;
    }

    getAdminRequest(assignment_user_url(studentID, courseID), function(err, data) {
      if (err){
        console.log(err);
        callback(err, 0, badges);
      } else if (data.status == "unauthorized"){
        console.log('User unauthorized');
        callback('User unauthorized', 0, badges);
      } else if (data.error){
        console.log(data.error);
        callback(data.error, 0, badges);
      } else if (data.length<1) {
        console.log('No Assignment Data Recorded');
        callback(null, 0, badges);
      } else {
        //Daily Yalie questions
        for (var i = 0; i < mongo_data.dailies.length; i++) {
          var daily_object = data.find(daily => daily.assignment_id == (mongo_data.dailies[i]).assignment_id);
          if (daily_object){
            var daily_grade = parseFloat(daily_object.grade);
            if (daily_grade == parseFloat(100)) {
              daily_done += 1
            }
          }
        }
        totalPoints += (parseInt(daily_done) * 50); //assign points for each daily
        //assign points for each badge earned
        if (daily_done >= 1) {
          awardBadge(1);
        }
        if (daily_done >= 5) {
          awardBadge(2);
        }
        if (daily_done >= 10) {
          awardBadge(3);
        }
        if (daily_done >= 15) {
          awardBadge(4);
        }
        if (daily_done >= 20) {
          awardBadge(5);
        }
        if (daily_done >= 25) {
          awardBadge(6);
        }

        for (var i = 0; i < mongo_data.modules.length; i++) {
          if (mongo_data.modules[i].open=='true'){
                    
            //practice objectives proficient
            var practice_object = data.find(assignment => assignment.assignment_id == (mongo_data.modules[i]).practice_link);
            if (practice_object){
              var practice_grade = parseFloat(practice_object.grade);
              if (practice_grade >= parseFloat(mongo_data.modules[i].practice_cutoff)) {

                practice_proficient += 1;

                //Process Practice Early Bird Badge
                if(mongo_data.modules[i].leaderboard.practice_early_bird == ""){
                  mongo_data.modules[i].leaderboard.practice_early_bird = studentID.toString();
                  awardBadge(26);
                  } else {
                  if (mongo_data.modules[i].leaderboard.practice_early_bird == studentID.toString()){
                    awardBadge(26);
                  }
                }

                //Process Practice Leaderboard

                if(mongo_data.modules[i].leaderboard.practice_leaderboard.find(placement => placement.student_id==studentID)){
                  //user is already on leaderboard
                  awardBadge(20);
                  user_index =  mongo_data.modules[i].leaderboard.practice_leaderboard.findIndex(placement => placement.student_id==studentID)
                  mongo_data.modules[i].leaderboard.practice_leaderboard[user_index] = {
                    'student_id': studentID.toString(),
                    'score': practice_grade
                  }
                  mongo_data.modules[i].leaderboard.practice_leaderboard = mongo_data.modules[i].leaderboard.practice_leaderboard.sort(sortLeaderboardScores)
                  if(mongo_data.modules[i].leaderboard.practice_leaderboard.findIndex(placement => placement.student_id==studentID)==0){
                    //user is top on leaderboard
                    awardBadge(21);
                  }

                } else {
                  // Process leaderboard if not full - add user automatically
                  if(mongo_data.modules[i].leaderboard.practice_leaderboard.length<10){
                    mongo_data.modules[i].leaderboard.practice_leaderboard.push({
                      'student_id': studentID.toString(),
                      'score': practice_grade
                    });
                    awardBadge(20);
                    mongo_data.modules[i].leaderboard.practice_leaderboard = mongo_data.modules[i].leaderboard.practice_leaderboard.sort(sortLeaderboardScores)
                    if(mongo_data.modules[i].leaderboard.practice_leaderboard.findIndex(placement => placement.student_id==studentID)==0){
                      //user is top on leaderboard
                      awardBadge(21);
                    }
                  } else {
                    //user not on full leaderboard - compare scores and update
                    mongo_data.modules[i].leaderboard.practice_leaderboard = mongo_data.modules[i].leaderboard.practice_leaderboard.sort(sortLeaderboardScores)
                    if (practice_grade > mongo_data.modules[i].leaderboard.practice_leaderboard[mongo_data.modules[i].leaderboard.practice_leaderboard.length-1].score){
                      mongo_data.modules[i].leaderboard.practice_leaderboard.pop()
                      mongo_data.modules[i].leaderboard.practice_leaderboard.push({
                        'student_id': studentID.toString(),
                        'score': practice_grade
                      });
                      awardBadge(20);
                      mongo_data.modules[i].leaderboard.practice_leaderboard = mongo_data.modules[i].leaderboard.practice_leaderboard.sort(sortLeaderboardScores)
                      if(mongo_data.modules[i].leaderboard.practice_leaderboard.findIndex(placement => placement.student_id==studentID)==0){
                        //user is top on leaderboard
                        awardBadge(21);
                      }
                    }
                  }
                }
              }
            }

            //quizzes attempted
            var quiz_object = data.find(assignment => assignment.assignment_id == (mongo_data.modules[i]).quiz_link);
            if (quiz_object){
              var quiz_grade = parseFloat(quiz_object.grade);
              if (quiz_grade > parseFloat(0)) {
                quizzes_attempted += 1;

                //Process Quiz Early Bird Badge                
                if(mongo_data.modules[i].leaderboard.quiz_early_bird == ""){
                  mongo_data.modules[i].leaderboard.quiz_early_bird = studentID.toString();
                  awardBadge(24);
                  mongo.updateData(courseID,'modules',{_id:(mongo_data.modules[i])._id},mongo_data.modules[i],
                    function(err,result){});
                  } else {
                  if (mongo_data.modules[i].leaderboard.quiz_early_bird == studentID.toString()){
                    awardBadge(24);
                  }
                }

                //Process Quiz Leaderboard

                if(mongo_data.modules[i].leaderboard.quiz_leaderboard.find(placement => placement.student_id==studentID)){
                  //user is already on leaderboard
                  awardBadge(22);
                  user_index =  mongo_data.modules[i].leaderboard.quiz_leaderboard.findIndex(placement => placement.student_id==studentID)
                  mongo_data.modules[i].leaderboard.quiz_leaderboard[user_index] = {
                    'student_id': studentID.toString(),
                    'score': quiz_grade
                  }
                  mongo_data.modules[i].leaderboard.quiz_leaderboard = mongo_data.modules[i].leaderboard.quiz_leaderboard.sort(sortLeaderboardScores)
                  if(mongo_data.modules[i].leaderboard.quiz_leaderboard.findIndex(placement => placement.student_id==studentID)==0){
                    //user is top on leaderboard
                    awardBadge(23);
                  }

                } else {
                  // Process leaderboard if not full - add user automatically
                  if(mongo_data.modules[i].leaderboard.quiz_leaderboard.length<10){
                    mongo_data.modules[i].leaderboard.quiz_leaderboard.push({
                      'student_id': studentID.toString(),
                      'score': quiz_grade
                    });
                    awardBadge(22);
                    mongo_data.modules[i].leaderboard.quiz_leaderboard = mongo_data.modules[i].leaderboard.quiz_leaderboard.sort(sortLeaderboardScores)
                    if(mongo_data.modules[i].leaderboard.quiz_leaderboard.findIndex(placement => placement.student_id==studentID)==0){
                      //user is top on leaderboard
                      awardBadge(23);
                    }
                  } else {
                    //user not on full leaderboard - compare scores and update
                    mongo_data.modules[i].leaderboard.quiz_leaderboard = mongo_data.modules[i].leaderboard.quiz_leaderboard.sort(sortLeaderboardScores)
                    if (quiz_grade > mongo_data.modules[i].leaderboard.quiz_leaderboard[mongo_data.modules[i].leaderboard.quiz_leaderboard.length-1].score){
                      mongo_data.modules[i].leaderboard.quiz_leaderboard.pop()
                      mongo_data.modules[i].leaderboard.quiz_leaderboard.push({
                        'student_id': studentID.toString(),
                        'score': quiz_grade
                      });
                      awardBadge(22);
                      mongo_data.modules[i].leaderboard.quiz_leaderboard = mongo_data.modules[i].leaderboard.quiz_leaderboard.sort(sortLeaderboardScores)
                      if(mongo_data.modules[i].leaderboard.quiz_leaderboard.findIndex(placement => placement.student_id==studentID)==0){
                        //user is top on leaderboard
                        awardBadge(23);
                      }
                    }
                  }
                }
              }
            }

            //number of reflections
            var reflection_object = data.find(assignment => assignment.assignment_id == (mongo_data.modules[i]).reflection_link);
            if(reflection_object){
              var reflection_grade = parseFloat(reflection_object.grade);
              if (reflection_grade == parseFloat(100)) {
                reflections_done += 1;
                
                //Process Reflection Early Bird Badge 
                if(mongo_data.modules[i].leaderboard.reflection_early_bird == ""){
                  mongo_data.modules[i].leaderboard.reflection_early_bird = studentID.toString();
                  awardBadge(25);
                  mongo.updateData(courseID,'modules',{_id:(mongo_data.modules[i])._id},mongo_data.modules[i],
                    function(err,result){});
                  } else {
                  if (mongo_data.modules[i].leaderboard.reflection_early_bird == studentID.toString()){
                    awardBadge(25);
                  }
                }
              }
            }
            mongo.updateData(courseID,'modules',{_id:(mongo_data.modules[i])._id},mongo_data.modules[i],function(err,result){});
          } 
        }


        totalPoints += (parseInt(practice_proficient) * 100); //assign points for each proficient ALEKS 
        //assign points for each badge earned
        if (practice_proficient >= 1) {
          awardBadge(7);
        }
        if (practice_proficient >= 3) {
          awardBadge(8);
        }
        if (practice_proficient >= 7) {
          awardBadge(9);
        }
        if (practice_proficient >= 10) {
          awardBadge(10);
        }

       
        totalPoints += (parseInt(quizzes_attempted) * 100); //assign points for each quiz
        //assign points for each badge earned
        if (quizzes_attempted >= 1) {
          awardBadge(11);
        }
        if (quizzes_attempted >= 3) {
          awardBadge(12);
        }
        if (quizzes_attempted >= 7) {
          awardBadge(13);
        }
        if (quizzes_attempted >= 10) {
          awardBadge(14);
        }

        totalPoints += (parseInt(reflections_done) * 100);
        //assign points for each badge earned
        if (reflections_done >= 1) {
          awardBadge(28);
        }
        if (reflections_done >= 3) {
          awardBadge(29);
        }
        if (reflections_done >= 7) {
          awardBadge(30);
        }
        if (reflections_done >= 10) {
          awardBadge(31);
        }


        callback(null, totalPoints, badges);
      }

    });
  });
}

function updateCanvas_masquerade(studentID, courseID, totalPoints, badges, callback) { // Update Canvas custom points column
  get_update_url(courseID, function(update_url){
    update_url = update_url + '/' + studentID;
    putAdminRequest(update_url, {
      column_data: {
        content: totalPoints.toString()
      }
    }, function(err, body) {
      callback(null, totalPoints, badges);
    });
  });
}

function getIndScoreAndBadges_masquerade(studentID, courseID, callback){ // Get score and badge info for user
    computeScoreAndBadges_masquerade(studentID, courseID, function(err, totalPoints, badges){ //compute scores
        updateCanvas_masquerade(studentID, courseID, totalPoints, badges, callback); //update Canvas
    });
}

function getStudentProgress_masquerade(studentID, courseID, callback) { // Get student progress for quizzes and tests (checkboxes)
  mongo.getAllData(courseID,function(mongo_data){
    getAdminRequest(assignment_user_url(studentID, courseID), function(err, user_assigments) {
      moduleProgress = mongo_data.modules;
      if (err){
        console.log(err);
        callback(null, moduleProgress);
      } else if (user_assigments.status == "unauthorized"){
        console.log('User unauthorized');
        callback(null, moduleProgress);
      } else if (user_assigments.error>0){
        console.log(data.error);
        callback(null, 0, moduleProgress);
      } else if (user_assigments.length<1) {
        console.log('No User Assignments recorded');
        callback(null, moduleProgress);
      } else {
        //get quiz and aleks progress
        for (var i = 0; i < moduleProgress.length; i++) {
          var module_object = mongo_data.modules.find(module => module._id == i + 1);
          
          //practice progress
          var practice_object = user_assigments.find(assignment => assignment.assignment_id == module_object.practice_link);
          if(practice_object){
            (moduleProgress[i]).practice_progress = parseFloat(practice_object.grade) >= parseFloat(module_object.practice_cutoff);
          } else {
            (moduleProgress[i]).practice_progress = false;
          }

          //quiz progress
          var quiz_object = user_assigments.find(assignment => assignment.assignment_id == module_object.quiz_link);
          if(quiz_object){
            (moduleProgress[i]).quiz_progress = parseFloat(quiz_object.grade) >= parseFloat(module_object.quiz_cutoff);
          } else {
            (moduleProgress[i]).quiz_progress = false;
          }

        }
        callback(null, moduleProgress);
      }
    });
  });
}

function getLeaderboardScores_masquerade(studentID, courseID, callback) { // get all leaderboard scores

  function mergeLeaderboardArrays(groupNames, scores) { //merge name and score arrays for leaderboard
    var combinedArray = []
    for (var i = 0; i < groupNames.length; i++) {
      combinedArray.push({
        'Name': groupNames[i],
        'Score': scores[i]
      })
    }
    if (groupNames.length < 3){
      fillerArray = Array(3-groupNames.length).fill({'Name': '','Score': 0});
      combinedArray = combinedArray.concat(fillerArray);
    }
    return combinedArray
  }

  asyncStuff.waterfall([
    getSections,
    getTotalScores,
  ], function(err, scores, groupNames, studentIndex) {
    function compare(a, b) {
      if (a.Score < b.Score) return 1;
      if (a.Score > b.Score) return -1;
      return 0;
    }

    callback(err, mergeLeaderboardArrays(groupNames, scores).sort(compare), mergeLeaderboardArrays(groupNames, scores)[parseInt(studentIndex)]);
  });

  function getSections(callback){
    function findIndexOfUser(studentIdsArrays) {
      for (var i = 0; i < studentIdsArrays.length; i++) {
        var index = studentIdsArrays[i].indexOf(parseInt(studentID));
        if (index > -1) {
          return i
        }
      }
    }

    getAdminRequest(sections_url(courseID),function(err,data){
      // remove section with all students
      for (var i = 0; i < data.length; i++) {
        if(data[i].students==null){ 
          data.splice(i, 1);
        }
      }
      if (data.length<1 || config.disableLeaderboard){ //disable leaderboard until sections are made
        callback(null,[],[],0);
      } else {
        groupNames = data.map(section => section.name);
        studentIdsArrays = data.map(section => section.students.map(studentInfo => studentInfo.id));
        studentIndex = findIndexOfUser(studentIdsArrays);
        callback(null, studentIdsArrays, groupNames, studentIndex)
      }
    });
  }

  
  function getTotalScores(studentIdsArrays, groupNames, studentIndex, callback2) {
    get_update_url(courseID, function(update_url){
      getAdminRequest(update_url, function(err, pointsInfo) {
        function getPointValue(studentID) {
          try {
            return parseInt((pointsInfo.find(studentInfo => studentInfo.user_id == studentID)).content);
          } catch (e) {
            return 0;
          }
        }
        var studentPoints = studentIdsArrays.map(studentIds => ((studentIds.map(studentId => getPointValue(studentId))).reduce((a, b) => a + b, 0)));
        callback2(null, studentPoints, groupNames, studentIndex);
      });
    })
  }
}

module.exports = {
  getRequest,
  postRequest,
  putRequest,
  getAdminRequest,
  postAdminRequest,
  putAdminRequest,
  getIndScoreAndBadges,
  getStudentProgress,
  getLeaderboardScores,
  getAdminLeaderboardScores,
  getStudents,
  getNextDailyYalie,
  getIndScoreAndBadges_masquerade,
  getStudentProgress_masquerade,
  getLeaderboardScores_masquerade,
}
