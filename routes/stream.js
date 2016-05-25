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
  res.set('Content-Type', 'application/x-mpegURL');
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
      request.get(commons.baseUrl() + req.params.streamName + (commons.isAkamai() ? '/streamPlaylist.m3u8' : '/index.m3u8'), function (err, resp, body) {
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
  var key = req.params.streamName + '/' + req.params.segmentName + '/' + req.params.fileName;
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
        url: commons.baseUrl() + key + '.ts',
        encoding: null
      };
      console.log(options.url);
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

var mergeSegmentName = function (req, res, next) {
  req.params.segmentName = req.params.path1 + '/' + req.params.path2 + '/' + req.params.path3; 
  next();
}

var normalizeStreamName = function (req, res, next) {
  if (commons.isAkamai()) {
    req.params.streamName = req.params.streamName.replace('(', '').replace(')', '').replace('0', '').toLowerCase();
  }
  next();
}

router.get('/index.m3u8', handleIndex);
router.get('/master.m3u8', handleIndex);
router.get('/:streamName/index.m3u8', normalizeStreamName, handlePlaylist);
router.get('/:streamName/streamPlaylist.m3u8', normalizeStreamName, handlePlaylist);
router.get('/:streamName/:segmentName/:fileName.ts', normalizeStreamName, handleTs);
router.get('/:streamName/:path1/:path2/:path3/:fileName.ts', normalizeStreamName, mergeSegmentName, handleTs);

module.exports = router;
