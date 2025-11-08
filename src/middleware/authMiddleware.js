const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
  const token = req.header('Authorization');

  if (!token) {
    return res.status(401).json({ error: 'Não autorizado. Token não fornecido.' });
  }

  const tokenString = token.split(' ')[1];
  
  if (!tokenString) {
     return res.status(401).json({ error: 'Não autorizado. Token mal formatado.' });
  }

  try {
    const decoded = jwt.verify(tokenString, process.env.JWT_SECRET);
    req.user = decoded.user;

    next();
  } catch (err) {
    res.status(401).json({ error: 'Token inválido.' });
  }
};