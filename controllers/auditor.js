'use strict';
const _ = require('lodash');
const db = require('../models').db;
const User = require('../models').User;
const Transaction = require('../models').Transaction;
const Record = require('../models').Record;
const Logtable = require('../models').Logtable;
const Order = require('../models').Order;
const config = require('../config/auditor');
const Router = require('express').Router;
const crypto = require('crypto');
const router = Router();
const Util = require('util');
const multer = require('multer');
const fs = Promise.promisifyAll(require('fs'));
const uploadPath = require('../config').upload;
const nodemailer = require('nodemailer');
const transporter = nodemailer.createTransport(config.mailConfig);

const cookPassword = (key, salt) => {
  var hash = crypto.createHash('sha512');
  const mid = key.length >> 1
  return hash.update(key.slice(0, mid))
    .update(salt)
    .update(key.slice(mid))
    .digest('base64');
};

const reportError = (path, err) => {
  console.error(
    `\nERROR occurs in ${path}:\n\n${Util.inspect(err)}\n`
  );
};

router.post('/auditor/login', Promise.coroutine(function* (req, res) {
  console.log('in /auditor/login', req.body);
  let user = yield User.findOne({
    where: { userName: req.body.userName },
    attributes: ['id', 'loginPass', 'salt', 'lastLogin']
  });
  if (!user) {
    return res.fail({ type: 'USER_NOT_EXIST' });
  }
  const password = cookPassword(req.body.loginPass,
                                user.salt)
  // 密码错误
  if (password !== user.loginPass)
    return res.fail({ type: 'INVALID_USERNAME_OR_PASSWORD' });
  // 更新最后登录时间
  /*user.lastLogin = new Date().toString()
  yield user.save()*/
  // 删除密码字段
  delete user.salt
  delete user.loginPass
  // 登录信息
  req.session.userId = user.id
  return res.success({ user });
}));

router.get('/auditor/logout', (req, res) => {
  console.log('in /auditor/logout');
  req.session.userId = null;
  return res.success({});
});

router.get('/auditor/info', Promise.coroutine(function* (req, res) {
  console.log('in /auditor/info');
  if (!req.session.userId) {
    return res.success({ })
  }
  const user = yield User.findById(req.session.userId, {
    attributes: ['userName', 'realName', 'balance', 'lastLogin',
                 'email', 'phone', 'idNumber', 'status']
  })
  return res.success({ user })
}));

router.get('/auditor/transactions', Promise.coroutine(function* (req, res) {
  console.log('in /auditor/transactions');
  if (!req.session.userId) {
    return res.status(403).fail()
  }
  const transactions = yield Record.findAll({
    order: ['id']
  });
  return res.success({ transactions })
}));

router.get('/auditor/check_username', Promise.coroutine(function* (req, res) {
  console.log('in check_username', req.query);
  const user = yield User.findOne({
    where: { userName: req.query.userName }
  })
  if (!user) {
    return res.success();
  } else {
    return res.fail({ type: 'USER_EXIST' });
  }
}));

router.get('/auditor/log', Promise.coroutine(function* (req, res) {
  console.log('in /auditor/log');
  if (!req.session.userId) {
    return res.status(403).fail()
  }
  const logtable = yield Logtable.findAll({
    order: ['id']
  });
  return res.success({ logtable })
}));



/*
生成每日订单，进行错误判断，生成日志代码，还不确定放在什么路由执行。
router.post('/auditor/change_loginpass', Promise.coroutine(function *(req, res) {
  console.log('in /auditor/change_loginpass');
  if (!req.session.userId) {
    return res.status(403).fail()
  }
  const user = yield User.findById(req.session.userId, {
    attributes: ['id', 'salt', 'loginPass']
  });

 const order = yield Order.findAll();
 const count = yield Order.count();
 for(var i=0;i<count;i++)
 {
    const buy = yield Transaction.findById(order[i].buyerTransId);
    const sell = yield Transaction.findById(order[i].sellerTransId);
    const newRecord = {
      buyerId: order[i].buyerId,
      sellerId: order[i].sellerId,
      totalCost: order[i].totalCost,
      buyerPay: buy.amount,
      sellerGet: sell.amount,
      status: order[i].status,
      orderId: order[i].id
    };
    const record = yield Record.create(newRecord);

    if(record.status===0){
      if(-record.buyerPay===record.sellerGet && record.sellerGet===record.totalCost){
        record.update({
          wrongStatus: 1
        });
      }
      else {
        if(record.totalCost===0 || record.totalCost>=500){
          record.update({
            wrongStatus: 2
          })
        }
        else{
          record.update({
            wrongStatus: 0
          })
        }        
      }
    }
    if(record.status===1){
      if(-record.buyerPay===record.sellerGet && record.sellerGet===record.totalCost){
        if(record.totalCost===0 || record.totalCost>=500){
          record.update({
            wrongStatus: 2
          })
        }
        else{
          record.update({
            wrongStatus: 0
          })
        }   
      }
      else {
        record.update({
          wrongStatus: 1
        })
      }
    }
  };


  const today = new Date();
   const count = yield Record.count({
    where:{
      wrongStatus: {'$gt': 0},
      createdAt: {'$between': [`${today.getFullYear()}-${today.getMonth()+1}-${today.getDate()}`, 
        `${today.getFullYear()}-${today.getMonth()+1}-${today.getDate()+1}`]}
    }
   });
   const record = yield Record.findAll({
    where:{
      wrongStatus: {'$gt': 0},
      createdAt: {'$between': [`${today.getFullYear()}-${today.getMonth()+1}-${today.getDate()}`, 
        `${today.getFullYear()}-${today.getMonth()+1}-${today.getDate()+1}`]}
    }
   });
   for(var i=0;i<count;i++)
   {
      const newLogtable = {
        buyerId: record[i].buyerId,
        sellerId: record[i].sellerId,
        totalCost: record[i].totalCost,
        buyerPay: record[i].buyerPay,
        sellerGet: record[i].sellerGet,
        status: record[i].status,
        orderId: record[i].orderId,
        wrongStatus: record[i].wrongStatus
      };
    const logtable = yield Logtable.create(newLogtable)
  };
  

  user.loginPass = cookPassword(req.body.loginPass, user.salt)
  yield user.save();
  return res.success();
}));*/

module.exports = router;
