const db = require('../db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config({ path: '.env' });
}

const PG_ERROR_CODE_UNIQUE_VIOLATION = '23505';

exports.createUser = async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
  }

  try {
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const newUser = await db.query(
      'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING *',
      [name, email, hashedPassword]
    );

    const userResponse = {
        id: newUser.rows[0].id,
        name: newUser.rows[0].name,
        email: newUser.rows[0].email
    };

    res.status(201).json(userResponse);

  } catch (err) {
    console.error(err.message);
    if (err.code === PG_ERROR_CODE_UNIQUE_VIOLATION) {
      return res.status(400).json({ error: 'Este e-mail já está cadastrado.' });
    }
    res.status(500).send('Erro no servidor');
  }
};

exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios.' });
    }

    const userQuery = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userQuery.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    const user = userQuery.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    const payload = {
      user: {
        id: user.id,
        email: user.email
      }
    };

    const token = jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.status(200).json({
      message: 'Login bem-sucedido!',
      token: token,
      user: { id: user.id, name: user.name, email: user.email }
    });

  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erro no servidor');
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    console.log('Usuário autenticado que fez a requisição:', req.user);
    
    const allUsers = await db.query('SELECT id, name, email FROM users');
    res.status(200).json(allUsers.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erro no servidor');
  }
};

exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params; // ID da URL

    const user = await db.query(
      'SELECT id, name, email, created_at FROM users WHERE id = $1',
      [id]
    );

    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    res.status(200).json(user.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erro no servidor');
  }
};

exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email } = req.body;
    
    const loggedInUserId = req.user.id; 

    if (parseInt(id, 10) !== loggedInUserId) {
         return res.status(403).json({ error: 'Acesso negado. Você só pode alterar seu próprio perfil.' });
    }
    
    if (!name || !email) {
      return res.status(400).json({ error: 'Nome e e-mail são obrigatórios.' });
    }

    const updatedUser = await db.query(
      'UPDATE users SET name = $1, email = $2 WHERE id = $3 RETURNING id, name, email',
      [name, email, id]
    );

    if (updatedUser.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    res.status(200).json(updatedUser.rows[0]);

  } catch (err) {
    console.error(err.message);
    if (err.code === PG_ERROR_CODE_UNIQUE_VIOLATION) {
      return res.status(400).json({ error: 'Este e-mail já está em uso.' });
    }
    res.status(500).send('Erro no servidor');
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const loggedInUserId = req.user.id;

    if (parseInt(id, 10) !== loggedInUserId) {
         return res.status(403).json({ error: 'Acesso negado. Você só pode deletar seu próprio perfil.' });
    }

    const deleteOp = await db.query('DELETE FROM users WHERE id = $1 RETURNING *', [
      id,
    ]);

    if (deleteOp.rowCount === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    res.status(200).json({ message: 'Usuário deletado com sucesso.' });

  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erro no servidor');
  }
};
