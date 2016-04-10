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
var _akamai = false;

module.exports = {
  baseUrl: function () {
    return _baseUrl;
  },
  baseIndex: function () {
    return _baseIndex;
  },
  isAkamai: function () {
    return _akamai;
  },
  updateSession: function (cb) {
    var self = this;
    request.post(API_OPTIONS, function (err, resp, body) {
      if (err) throw err;
      _indexUrl = body.asset.hls.adaptive[0];
      _baseUrl = _indexUrl.split('index.m3u8')[0];
      request(_indexUrl, function (err, resp, body) {
        if (err) throw err;
        _baseIndex = body;
        _akamai = _indexUrl.indexOf('master.m3u8') !== -1;
        if (_akamai) _baseUrl = _indexUrl.split('master.m3u8')[0];
        cb();
        console.log('New baseUrl: ' + self.baseUrl());
      });
    });
  }
};
