## 写在前面   (superagent+cheerio+async+eventproxy 实现node社区微小爬虫)

alsotang 委实是个有趣的人。 最近读到他的包教不包会的node课程，加上之前在慕课网的爬虫教程，闲来无事整理外加实践了下。

### 大体思路
* [`superagent`](http://visionmedia.github.io/superagent/)      能够实现主动发起get/post/delete等请求，用以抓取网页
* [`cheerio`](https://github.com/cheeriojs/cheerio) 能够对请求结果进行解析，解析方式和jquery的解析方式几乎完全相同，用以分析网页
* `eventproxy`或`async`控制并发

再次安利[`supervisor`](https://github.com/nswbmw/N-blog/blob/master/book/3.1%20%E5%88%9D%E5%A7%8B%E5%8C%96%E4%B8%80%E4%B8%AA%20Express%20%E9%A1%B9%E7%9B%AE.md#311-supervisor)，委实好用

废话不多说，开整~

### 1. 安装superagent、cheerio  
    npm install superagent cheerio --save
此处叨扰几句--save 和--save-dev的区别  

> -save-dev 是你开发时候依赖的东西，--save 是你发布之后还依赖的东西。
比如，你写 ES6 代码，如果你想编译成 ES5 发布那么 babel 就是devDependencies。
如果你用了 jQuery，由于发布之后还是依赖jQuery，所以是dependencies。但是在 npm 里面除了二进制的依赖，似乎也不用区分是不是dev。
因为使用npm就是自己编译的意思，而不使用npm直接拿编译后的版本的，这些依赖项也看不到。

### 2. 使用superagent和cheerio实现爬虫
```javascript
var express = require("express");
var superagent = require("superagent");
var cheerio = require("cheerio");

var app = express();

app.get("/",function(req,resp){
    superagent.get("https://cnodejs.org/").end(function(error,data){
        if(error){
            return next(error);
        }
        var $=cheerio.load(data.text);    
        var arr=[];
        $('#topic_list .topic_title').each(function(idx,element){
            var $element=$(element);
            arr.push({
                "title":$element.attr("title"),
                "href":$element.attr("href")
            });
        });
        resp.send(arr);
    });
});

app.listen(9527)
```  
我们扒的是node社区，里面...老好玩儿了。

### eventproxy或async实现异步并发控制  
我们知道，使用 superagent 和 cheerio 来取主页内容，那只需要发起一次 http get 请求就能办到。但我们需要取出每个主题的第一条评论，这就要求我们对每个主题的链接发起请求，并用 cheerio去取出其中的第一条评论。  

> 线程并发委实是个很复杂的概念，比如线程间通信、死锁等，这里不多赘述。

1. 原生方法实现并发  
较为常见的是`计数器`控制，比如一共三个并发，我们期望其3个线程都完成后在执行下一步操作，then we can do  
```javascriptvar count=0;
var result={};
$.get("http://example.com/1.html",function(data){
    result.data1=data;
    count++;
    handler();
});
$.get("http://example.com/2.html",function(data){
    result.data2=data;
    count++;
    handler();
});
$.get("http://example.com/3.html",function(data){
    result.data3=data;
    count++;
    handler();
});
function handler(){
    if(count==3){
        var html=getHtml(result);
        return html;
    }
}
```
当然还有  callback hell
```javascript
// 参考 jquery 的 $.get 的方法
$.get("http://data1_source", function (data1) {
  // something
  $.get("http://data2_source", function (data2) {
    // something
    $.get("http://data3_source", function (data3) {
      // something
      var html = fuck(data1, data2, data3);
      render(html);
    });
  });
});
```    
## 重头戏之一 eventproxy  
我们尝试用eventproxy实现并发demo  
```javascript
var ep = new eventproxy();
ep.all('data1_event', 'data2_event', 'data3_event', function (data1, data2, data3) {
  var html = fuck(data1, data2, data3);
  render(html);
});

$.get('http://data1_source', function (data) {
  ep.emit('data1_event', data);
  });

$.get('http://data2_source', function (data) {
  ep.emit('data2_event', data);
  });

$.get('http://data3_source', function (data) {
  ep.emit('data3_event', data);
  });
  ```
    很明显，eventproxy只是透明了计数器count的使用而已。
>  当三个事件未同时完成时，ep.emit() 调用之后不会做任何事；当三个事件都完成的时候，就会调用末尾的那个回调函数，来对它们进行统一处理。  
eventproxy 提供了不少其他场景所需的 API，但最最常用的用法就是以上的这种，即：  
```先 var ep = new eventproxy(); 得到一个 eventproxy 实例。
告诉它你要监听哪些事件，并给它一个回调函数。ep.all('event1', 'event2', function (result1, result2) {})。
在适当的时候 ep.emit('event_name', eventData)。
```

用eventproxy实现的代码我就不贴了，自己尝试了下就换成async了。  运行之后有些请求报错，很有可能是并发请求数量太多遭到服务器拒绝服务，要知道，除去 CNode 的话，别的网站有可能会因为你发出的并发连接数太多而当你是在恶意请求，把你的 IP 封掉。  
## 重头戏之二 async  
来看看demo
```javascript
var async=require("async");
var currentCount=0;
console.log("will create a url list size 10 !");
var urls=[];
for(var i=0;i<10;i++){
    urls.push('http://www.example.com/'+i+".html");
}
async.mapLimit(urls,2,function(url,callback){
    var delay=parseInt(500);
    currentCount++;
    console.log("currentCount is :"+currentCount+",current url is :"+url+",use time is :"+delay+" mm");
    setTimeout(function(){
        currentCount--;
        callback(null,url+' html content ');
    },delay);
},function(err,result){
    console.log("result:");
    console.log(result);
});
```
可以看出mapLimit核心的操作就是先放入需要异步操作的数据，再设定并发数；然后在第一个func中对其进行遍历执行，当执行完成后调用callback，最后所有callback会汇总到第二个func中。  

最后看看最终代码
```javacript
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
```
 
后台检测数据大致如下
```javascript
Starting child process with 'node app'
当前并发数:0
当前并发数:1
当前并发数:2
当前并发数:3
当前并发数:4
当前并发数:5
释放并发数，当前并发数为:5
当前并发数:5
释放并发数，当前并发数为:5
当前并发数:5
释放并发数，当前并发数为:5
当前并发数:5
释放并发数，当前并发数为:5
当前并发数:5
释放并发数，当前并发数为:5
当前并发数:5
释放并发数，当前并发数为:5
...
```
页面大致长这样儿
![index](https://github.com/xiangergou/-node-internet-worm/raw/master/assets/img/demo.jpeg) 