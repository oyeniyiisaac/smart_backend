const express = require('express')
const { register, signin, login, dashboard } = require('../controller/student.controller')
const router = express.Router()

router.get('/signin', signin)
router.get('/dashboard', dashboard)


router.post('/register', register)
router.post('/login', login)


module.exports = router
