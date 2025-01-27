const bcrypt = require('bcryptjs')
const helpers = require('../_helpers')
const db = require('../models')
const User = db.User
const Tweet = db.Tweet
const Reply = db.Reply
const Like = db.Like
const Followship = db.Followship

const fs = require('fs')
const imgur = require('imgur-node-api')
const IMGUR_CLIENT_ID = '3bdeb4f2cae8587'
const userService = require('../services/userService')

const userController = {
  //註冊頁面
  signUpPage: (req, res) => {
    return res.render('signup')
  },
  signUp: (req, res) => {
    if (!req.body.email || !req.body.name || !req.body.account || !req.body.password) {
      req.flash('error_msg', '所有欄位皆為必填')
      res.redirect('signup')
    }
    if (req.body.checkPassword !== req.body.password) {
      req.flash('error_msg', '兩次密碼輸入不同！')
      return res.redirect('/signup')
    } else {
      User.findOne({ where: { email: req.body.email } })
        .then(user => {
          if (user) {
            req.flash('error_msg', '信箱已重複註冊！')
            return res.redirect('/signup')
          } else {
            User.findOne({ where: { account: req.body.account } })
              .then(user => {
                if (user) {
                  req.flash('error_msg', '帳號已重複註冊！')
                  return res.redirect('/signup')
                } else {
                  User.create({
                    account: req.body.account,
                    name: req.body.name,
                    email: req.body.email,
                    password: bcrypt.hashSync(req.body.password, bcrypt.genSaltSync(10), null)
                  })
                    .then(user => {
                      req.flash('success_msg', '成功註冊帳號！')
                      return res.redirect('/signin')
                    })
                }      
              })
            }
        })
    }
  },
  signInPage: (req, res) => {
    if (res.locals.user) {
      delete res.locals.user
    }

    return res.render('signin')
  },
  signIn: (req, res) => {
    req.flash('success_msg', '成功登入！')
    res.redirect('/tweets')
  },
  editPage: (req, res) => {
    return User.findByPk(helpers.getUser(req).id)
      .then((user) => {
        res.render('edit', { user: user.toJSON() })
      })
  },
  editData: (req, res) => {
    const { name, email, password, checkPassword, account } = req.body
    const currentUser = helpers.getUser(req)
    if (!email || !name || !password || !account) {
      req.flash('error_msg', '所有欄位皆為必填')
      return res.redirect('back')
    }

    if (checkPassword !== password) {
      req.flash('error_msg', '兩次密碼輸入不同！')
      return res.redirect('back')
    }
    if (email !== currentUser.email) {
      return User.findOne({ where: { email: email }})
        .then((user) => {
          if (user) {
            req.flash('error_msg', '信箱已存在')
            return res.redirect('back')
          }
        })
    }
    if (account !== currentUser.account) {
      return User.findOne({ where: { account: account } })
        .then((user) => {
          if (user) {
            req.flash('error_msg', '帳號已存在')
            return res.redirect('back')
          }
        })
    }
    return User.findByPk(currentUser.id)
      .then((user) => {
        user.update({
          name: name,
          account: account,
          email: email,
          password: bcrypt.hashSync(password, bcrypt.genSaltSync(10), null),
        })
        return res.redirect('/tweets')
      })
  },
  logout: (req, res) => {
    req.flash('success_msg', '登出成功！')
    req.logout()
    res.redirect('/signin')
  },
  getUser: (req, res) => {
    User.findByPk(req.params.id, { 
      include: [
        { model: User, as: 'Followings' },
        { model: User, as: 'Followers' },
        { model: Tweet, include: [Like, Reply] },
      ], order: [[Tweet, 'createdAt', 'DESC']]
    }).then(user => {
      // to avoid conflicting with res.locals.user
        return Like.findAll({ where: { UserId: helpers.getUser(req).id }, raw: true, nest: true })
          .then((likes) => {

          const userData = user.toJSON()
          likes = likes.map(like => like.TweetId)
          userData.Tweets.forEach(tweet => {
            tweet.isLiked = likes.includes(tweet.id)
          })
          userData.tweetCount = userData.Tweets.length
          userData.isFollowed = userData.Followers.map((er) => er.id).includes(helpers.getUser(req).id)
          
          userService.getTopUser(req, res, topUser => {
            return res.render('userTweets', { userData, topUser })
          })
        })
      })
  },
  getUserReplies: (req, res) => {
    return User.findByPk(req.params.id, {
      include: [
        Tweet,
        { model: User, as: 'Followers' },
        { model: User, as: 'Followings' },
        { model: Reply, include: [{ model: Tweet, include: [Reply, User] }] }
      ], order: [[Reply, 'createdAt', 'DESC']]
    })
      .then(user => {
        const userData = user.toJSON()
        userData.isFollowed = user.Followers.map((er) => er.id).includes(helpers.getUser(req).id)

        userService.getTopUser(req, res, topUser => {
          return res.render('userReplies', { userData, topUser })
        })
      })
  },
  getLikes: (req, res) => {
    return User.findByPk(req.params.id, {
      include: [Tweet,
        { model: User, as: 'Followers' },
        { model: User, as: 'Followings' },
        { model: Like, include: [{ model: Tweet, include: [Reply, Like, User] }] },
      ], order: [[Like, 'createdAt', 'DESC']]
    })
      .then(user => {
        return Like.findAll({ where: { UserId: helpers.getUser(req).id }, raw: true, nest: true })
          .then((likes) => {
            const userData = user.toJSON()
            likes = likes.map(like => like.TweetId)
            userData.Tweets.forEach(tweet => {
              tweet.isLiked = likes.includes(tweet.id)
            })
            userData.isFollowed = user.Followers.map((er) => er.id).includes(helpers.getUser(req).id)

            userService.getTopUser(req, res, topUser => {
              console.log(userData)
              return res.render('userLikes', { userData, topUser })
            })
          })
      })

  },
  addFollowing: (req, res) => {
    if (helpers.getUser(req).id === Number(req.body.id)) {
      req.flash('error_msg', '不能自己追蹤自己')
      return res.redirect(200, 'back')
    }
    return Followship.create({
      followerId: helpers.getUser(req).id,
      followingId: req.body.id
    })
      .then((followship) => {
        req.flash('success_msg', '追蹤成功')
        return res.redirect('back')
      })
  },
  removeFollowing: (req, res) => {
    return Followship.findOne({
      where: {
        followerId: helpers.getUser(req).id,
        followingId: req.params.id
      } })
      .then((followship) => {
        followship.destroy()
          .then((followship) => {
            req.flash('success_msg', '取消追蹤')
            return res.redirect('back')
          })
      })
  },
  getFollowings: (req, res) => {
    return User.findByPk(req.params.id, {
      include: [
        Tweet,
        { model: User, as: 'Followings' }
      ]
    })
      .then(user => {
        const userData = user.toJSON()
        userData.Followings = user.Followings.map((Followings) => ({
          ...Followings.dataValues,
          isFollowed: helpers.getUser(req).Followings.map((er) => er.id).includes(Followings.id)
        }))
        userData.tweetCount = user.Tweets.length
        userData.Followings.sort((a, b) => b.Followship.createdAt - a.Followship.createdAt)
        userService.getTopUser(req, res, topUser => {
          return res.render('followings', { userData, topUser })
        })
      })
  },
  getFollowers: (req, res) => {
    return User.findByPk(req.params.id, {
      include: [
        Tweet,
        { model: User, as: 'Followers' }
      ]
    })
      .then(user => {
        const userData = user.toJSON()
        userData.Followers = user.Followers.map((Followers) => ({
          ...Followers.dataValues,
          isFollowed: helpers.getUser(req).Followings.map((er) => er.id).includes(Followers.id)
        }))
        userData.tweetCount = user.Tweets.length
        userData.Followers.sort((a, b) => b.Followship.createdAt - a.Followship.createdAt)
        userService.getTopUser(req, res, topUser => {
          return res.render('followers', { userData, topUser })
        })
      })
  },
  putUserProfile: (req, res) => {
    if (!req.body.name) {
      req.flash('error_msg', "請輸入名稱")
      return res.redirect('back')
    } 
    if (!req.body.introduction) {
      req.flash('error_msg', "請輸入自我介紹")
      return res.redirect('back')
    }
    const { files } = req
    let cover = ''
    let avatar = ''
    if (files) {
      cover = files.cover
      avatar = files.avatar
    }
    if (cover && avatar) {
      console.log('封面跟頭貼都有檔案')
      imgur.setClientID(IMGUR_CLIENT_ID)
      imgur.upload(cover[0].path, (err, imgCover) => {
        if (avatar) {
          imgur.upload(avatar[0].path, async (err, imgAvr) => {
            const user = await User.findByPk(req.params.id)
            await user.update({
              cover: cover[0] ? imgCover.data.link : user.cover,
              avatar: avatar[0] ? imgAvr.data.link : user.avatar,
              name: user.name,
              introduction: user.introduction ? user.introduction : ''
            })
            return res.redirect('back')
          })
        }
      })
    } else if (cover) { // 載入 cover
      console.log('封面有檔案')
      imgur.setClientID(IMGUR_CLIENT_ID)
      imgur.upload(cover[0].path, async (err, imgCover) => {
        const user = await User.findByPk(req.params.id)
        await user.update({
          cover: cover[0] ? imgCover.data.link : user.cover,
          avatar: user.avatar,
          name: user.name,
          introduction: user.introduction ? user.introduction : ''
        }).then(user => {
          console.log(user)
        }).catch(error => {
          console.log(error)
        })
        return res.redirect('back')
      })
    } else if (avatar) { // 載入 avatar
      console.log('頭貼都有檔案')
      imgur.setClientID(IMGUR_CLIENT_ID)
      imgur.upload(avatar[0].path, async (err, imgAvr) => {
        const user = await User.findByPk(req.params.id)
        console.log(imgAvr)
        await user.update({
          cover: user.cover,
          avatar: avatar[0] ? imgAvr.data.link : user.avatar,
          name: user.name,
          introduction: user.introduction ? user.introduction : ''
        }).then(user => {
          console.log(user)
        }).catch(error => {
          console.log(error)
        })
        return res.redirect('back')
      })
    } else {
      console.log('完全沒有檔案')
      return User.findByPk(req.params.id)
        .then(user => {
          user.update({
            name: req.body.name,
            avatar: user.avatar,
            cover: user.cover,
            introduction: req.body.introduction
          }).then(user => {
            // return res.json({ status: 'success', data: user })
            return res.redirect('back')
          }).catch(error => {
            console.log(error)
          })
        })

    }
  }
}

module.exports = userController