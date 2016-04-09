var express = require('express');
var logger = require('morgan');

var app = express();

app.use(logger('dev'));

['stream'].forEach(function (route) {
  app.use('/' + route, require('./routes/' + route));
});

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
  app.use(function (err, req, res, next) {
    if (err.status === 500) {
      console.log(err.stack);
    }
    res.status(err.status || 500);
    res.send(err);
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function (err, req, res, next) {
  if (err.status === 500) {
    console.log(err.stack);
  }
  res.status(err.status || 500);
  res.render('error', {
    message: err.message,
    error: {}
  });
});

module.exports = app;
