var request = require('request');

var API_OPTIONS = {
  uri: 'http://api.viu.now.com/p8/1/getLiveURL',
  method: 'post',
  json: {
    'channelno': '099',
    'mode': 'prod',
    'deviceId': '0000anonymous_user',
    'format': 'HLS'
  }
};
var _indexUrl;
var _baseUrl;
var _baseIndex;

module.exports = {
  baseUrl: function () {
    return _baseUrl;
  },
  baseIndex: function () {
    return _baseIndex;
  },
  waitForBaseFetched: function (cb) {
    request.post(API_OPTIONS, function (err, resp, body) {
      if (err) throw err;
      _indexUrl = body.asset.hls.adaptive[0];
      _baseUrl = _indexUrl.split('index.m3u8')[0];
      request(_indexUrl, function (err, resp, body) {
        if (err) throw err;
        _baseIndex = body;
        cb();
      });
    });
  },
  updateSession: function (cb) {
    console.log('Updating session...');
    this.waitForBaseFetched(cb);
    console.log('Done, new baseUrl: ' + this.baseUrl());
  }
};
