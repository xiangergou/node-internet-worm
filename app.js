var express = require('express')
var app = express()
var superagent = require('superagent')
var cheerio = require('cheerio')
var url=require("url");
var async = require('async')

var baseUrl = 'https://cnodejs.org/'

app.get('/', function (req, res, next) {
  var concurrentCount = 0

  superagent.get(baseUrl)
    .end(function(err, sres) {
      if (err) {
        return next(err)
      }
      var $ = cheerio.load(sres.text)
      var urlArr = []
      $('#topic_list .topic_title').each(function(index, el) {
        var $el = $(el)
        var _url = url.resolve(baseUrl, $el.attr('href'))
        urlArr.push(_url)
      })

      async.mapLimit(urlArr, 5, function(url, callback) {
        console.log('当前并发数:' + concurrentCount++);
        superagent.get(url).end(function(err, resq) {
          if (err) {
            console.log("get \""+url+"\" error !"+err);
            console.log("message info:"+JSON.stringify(resq));
          }
          var $ = cheerio.load(resq.text)
          var jsonData = {
              title:$(".topic_full_title").text().trim(),
              href:url,
              firstcomment:$(".reply_area .markdown-text").eq(0).text().trim()
          };
          callback(null, jsonData);
          concurrentCount--
          console.log('释放并发数，当前并发数为:' + concurrentCount);
        })
      }, function(error,results) {

        res.send(results); 
      })
    })
})

app.listen(9527)