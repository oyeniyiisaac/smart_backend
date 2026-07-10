const express = require('express')
const app = express()
require('dotenv').config()
const cors = require('cors')
const mongoose = require('mongoose')
const URL = process.env.MONGO_URL
const port = process.env.port
const UserRoute = require('./routes/student.route')
const AdminRoute = require('./routes/adminlog.route')
app.use(express.urlencoded({ extended: true }))
app.use(express.json())
app.use(cors())
app.use('/', UserRoute)
app.use('/admin', AdminRoute)           

mongoose.connect(URL)
    .then(() => {
        console.log('MongoDB connected');
        console.log()
    })
    .catch((err) => {
    console.log(err);
    })


app.listen(port, () => {
    console.log(port)
})
