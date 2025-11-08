const express = require('express');
const cors = require('cors');
require('dotenv').config({ path: '.env' });

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const userRoutes = require('./routes/userRoutes');

app.use('/api/users', userRoutes);

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});