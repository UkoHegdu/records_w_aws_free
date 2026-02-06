const express = require('express');
const { invokeLambda } = require('../lambdaAdapter');
const { getHandler } = require('../config/lambdaPath');

const router = express.Router();

router.get('/search', (req, res) => invokeLambda(getHandler('user_search'), req, res));
router.get('/maps', (req, res) => invokeLambda(getHandler('mapSearch'), req, res));
router.get('/maps/status/:jobId', (req, res) => invokeLambda(getHandler('checkJobStatus'), req, res));

router.get('/alerts', (req, res) => invokeLambda(getHandler('create_alert'), req, res));
router.post('/alerts', (req, res) => invokeLambda(getHandler('create_alert'), req, res));
router.delete('/alerts/:id', (req, res) => invokeLambda(getHandler('create_alert'), req, res));

router.post('/login', (req, res) => invokeLambda(getHandler('login'), req, res));
router.post('/register', (req, res) => invokeLambda(getHandler('register'), req, res));
router.post('/refresh', (req, res) => invokeLambda(getHandler('refreshToken'), req, res));
router.post('/logout', (req, res) => invokeLambda(getHandler('logout'), req, res));

router.get('/profile', (req, res) => invokeLambda(getHandler('getUserProfile'), req, res));
router.post('/accountNames', (req, res) => invokeLambda(getHandler('accountNames'), req, res));

router.get('/tm-username', (req, res) => invokeLambda(getHandler('verifyTmUsername'), req, res));
router.post('/tm-username', (req, res) => invokeLambda(getHandler('verifyTmUsername'), req, res));

module.exports = router;
