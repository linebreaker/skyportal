/* jshint node: true */
'use strict';

var commands = require('./commands');
var usb = require('usb');
var vendorList = [0x1430];
var productList = [
  0x1f17,  // usb wired (pc, xbox)
  0x0150   // wii wireless (also ps3?)
];

// initialise the command prefixes which matches index for index with
// the product list
var commandPrefixes = [
  [0x0B, 0x14],
  []
];

// initialise the input endpoints for the various product ids
var inpoints = [
  0x81
];
// initialise the output endpoints for the various product ids
var outpoints = [
  0x02
];


/**
  # skyportal

  This is a top-level interface to an rfid reader and writer that happens
  to double as a very nice glowy thing.  The library itself have been written
  to support multiple skyportals on the one machine allowing you do so
  some pretty neat things when you have a few usb ports spare :)

  ## Reference

  ### skyportal.find(index == 0)

  Look for a skyportal within the current usb devices.

**/
var find = exports.find = function(index) {
  var device;
  var productIdx;

  // get the portal
  device = usb.getDeviceList().filter(isPortal)[index || 0];

  // if we don't have a device, return
  if (! device) {
    return;
  }

  // find the product index so we can patch in the appropriate command prefix
  productIdx = productList.indexOf(device.deviceDescriptor.idProduct);

  return {
    commandPrefix: commandPrefixes[productIdx] || [],
    device: device,
    productIdx: productIdx
  };
};

/**
  ### skyportal.open(portal, callback)

  Open the portal using the portal data that has been retrieved
  from a find operation.

**/
var open = exports.open = function(portal, callback) {
  var device = (portal || {}).device;

  // if we don't have a valid device, then abort
  if (! device) {
    return callback(new Error('no device data'));
  }

  try {
    // open the device
    device.open();
  }
  catch (e) {
    return callback(e);
  }

  // reset the device and then open the interface
  device.reset(function(err) {
    var di;

    if (err) {
      return callback(err);
    }

    // select the portal interface
    di = device.interface(0);

    // if the kernel driver is active for the interface, release
    if (di.isKernelDriverActive()) {
      di.detachKernelDriver();
    }

    // claim the interface (um, horizon)
    try {
      di.claim();
    }
    catch (e) {
      return callback(e);
    }

    // patch in the input and output endpoints
    portal.i = di.endpoint(inpoints[portal.productIdx] || 0x81);
    portal.o = di.endpoint(outpoints[portal.productIdx] || 0x02);

    // send the reset signal to the device
    send(commands.reset(), portal, function(err) {
      if (err) {
        return callback(err);
      }

      // send the activate and trigger the outer callback
      send(commands.activate(), portal, callback);
    });
  });
};

/**
  ### skyportal.send(bytes, portal, callback)

  Send a chunk of bytes to the portal. If required the device appropriate
  command prefix will be prepended to the bytes before sending.

**/
var send = exports.send = function(bytes, portal, callback) {
  // TODO: handle bytes being provided in another format
  var data = new Buffer(portal.commandPrefix.concat(bytes || []));

  // send the data
  portal.o.transfer(data, callback);
};

/* internal functions */

function isPortal(device) {
  return vendorList.indexOf(device.deviceDescriptor.idVendor) >= 0 &&
    productList.indexOf(device.deviceDescriptor.idProduct) >= 0;
}