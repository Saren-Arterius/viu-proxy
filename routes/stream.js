var EventEmitter = require('events');
var express = require('express');
var request = require('request');
var config = require('../config');
var commons = require('../commons');
var LRU = require('lru-cache');
var router = express.Router();

var tsCache = LRU({
  max: config.ts_cache_size_mb * 1024 * 1024,
  maxAge: config.ts_cache_age_minutes * 60 * 1000,
  length: function (n, key) {
    return n.length;
  }
});

var m3u8Cache = LRU({
  max: 1024,
  maxAge: 1000
});

var eventEmitters = {};

var sendBuffer = function (res, buffer) {
  res.setHeader('Cache-Control', 'public, max-age=14400');
  res.end(buffer);
};

var handleIndex = function (req, res, next) {
  res.send(commons.baseIndex());
};

var handlePlaylist = function (req, res, next) {
  var key = req.params.streamName;
  var cachedPlaylist = m3u8Cache.get(key);
  if (cachedPlaylist) {
    res.send(cachedPlaylist);
    return;
  }
  var eventEmitter = eventEmitters[key];
  if (!eventEmitter) {
    eventEmitter = new EventEmitter();
    eventEmitters[key] = eventEmitter;
    eventEmitter.setMaxListeners(100000);
    var fulfill = function () {
      request.get(commons.baseUrl() + req.params.streamName + '/index.m3u8', function (err, resp, body) {
        if (resp.statusCode === 403) {
          return commons.updateSession(fulfill);
        }
        if (!err && resp.statusCode === 200) {
          m3u8Cache.set(key, body);
          eventEmitter.emit('cached');
        } else {
          eventEmitter.emit('err', resp.statusCode === 404 ? 404 : 500);
        }
        eventEmitter.removeAllListeners();
        delete eventEmitters[key];
      });
    };
    fulfill();
  }
  eventEmitter.on('cached', function () {
    var playlist = m3u8Cache.get(key);
    if (playlist) {
      res.send(playlist);
    } else {
      res.sendStatus(500);
    }
  });
  eventEmitter.on('err', function (code) {
    res.sendStatus(code);
  });
};

var handleTs = function (req, res, next) {
  var key = req.params.streamName + '/' + req.params.segmentName;
  var cachedTSBuffer = tsCache.get(key);
  if (cachedTSBuffer) {
    sendBuffer(res, cachedTSBuffer);
    return;
  }
  var eventEmitter = eventEmitters[key];
  if (!eventEmitter) {
    eventEmitter = new EventEmitter();
    eventEmitters[key] = eventEmitter;
    eventEmitter.setMaxListeners(100000);
    var fulfill = function () {
      var options = {
        url: commons.baseUrl() + key + '/segment.ts',
        encoding: null
      };
      request.get(options, function (err, resp, body) {
        if (resp.statusCode === 403) {
          return commons.updateSession(fulfill);
        }
        if (!err && resp.statusCode === 200) {
          tsCache.set(key, body);
          eventEmitter.emit('cached');
        } else {
          eventEmitter.emit('err', resp.statusCode === 404 ? 404 : 500);
        }
        eventEmitter.removeAllListeners();
        delete eventEmitters[key];
      });
    };
    fulfill();
  }
  eventEmitter.on('cached', function () {
    var buffer = tsCache.get(key);
    if (buffer) {
      sendBuffer(res, buffer);
    } else {
      res.sendStatus(500);
    }
  });
  eventEmitter.on('err', function (code) {
    res.sendStatus(code);
  });
};

router.get('/index.m3u8', handleIndex);
router.get('/:streamName/index.m3u8', handlePlaylist);
router.get('/:streamName/:segmentName/segment.ts', handleTs);
module.exports = router;
