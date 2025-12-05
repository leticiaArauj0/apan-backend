const db = require('../db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config({ path: '.env' });
}

const PG_ERROR_CODE_UNIQUE_VIOLATION = '23505';

exports.createUser = async (req, res) => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios, incluindo a função.' });
  }

  try {
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const newUser = await db.query(
      'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, email, hashedPassword, role]
    );

    const userResponse = {
        id: newUser.rows[0].id,
        name: newUser.rows[0].name,
        email: newUser.rows[0].email,
        role: newUser.rows[0].role
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
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });

  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erro no servidor');
  }
};

const transporter = nodemailer.createTransport({
    service: 'gmail', 
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

exports.forgotPassword = async (req, res) => {
    const { email } = req.body;

    try {
        const userQuery = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        
        if (userQuery.rows.length === 0) {
            return res.status(404).json({ error: 'Usuário não encontrado.' });
        }

        const user = userQuery.rows[0];

        const token = crypto.randomBytes(20).toString('hex');

        const now = new Date();
        now.setHours(now.getHours() + 1); 

        await db.query(
            'UPDATE users SET reset_password_token = $1, reset_password_expires = $2 WHERE id = $3',
            [token, now, user.id]
        );

        const resetLink = `http://localhost:5173/reset-password/${token}`;

        const mailOptions = {
          to: email,
          from: process.env.EMAIL_USER,
          subject: 'Recuperação de Senha - APAN',
          text: `Olá, ${user.name}.\n\nVocê solicitou a troca de senha. Acesse o link a seguir para redefinir:\n\n${resetLink}\n\nSe não foi você, ignore este email.`,
          html: `
                  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
                      <h2 style="color: #333;">Recuperação de Senha</h2>
                      <p>Olá, <strong>${user.name}</strong>!</p>
                      <p>Recebemos uma solicitação para redefinir a senha da sua conta no sistema APAN.</p>
                      <p>Clique no botão abaixo para criar uma nova senha:</p>
                      
                      <div style="text-align: center; margin: 30px 0;">
                          <a href="${resetLink}" style="background-color: #2E8B57; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
                              Redefinir Minha Senha
                          </a>
                      </div>

                      <p>Ou copie e cole o link abaixo no seu navegador:</p>
                      <p style="word-break: break-all; color: #555;">${resetLink}</p>
                      
                      <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
                      <p style="font-size: 12px; color: #999;">Se você não solicitou essa alteração, por favor ignore este e-mail. O link expira em 1 hora.</p>
                  </div>
              `
        };

        await transporter.sendMail(mailOptions);

        return res.status(200).json({ message: 'Email de recuperação enviado!' });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Erro ao enviar email de recuperação.' });
    }
};

exports.resetPassword = async (req, res) => {
    const { token } = req.params;
    const { password } = req.body;

    try {
        const userQuery = await db.query(
            'SELECT * FROM users WHERE reset_password_token = $1 AND reset_password_expires > NOW()',
            [token]
        );

        if (userQuery.rows.length === 0) {
            return res.status(400).json({ error: 'Token inválido ou expirado.' });
        }

        const user = userQuery.rows[0];

        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        await db.query(
            'UPDATE users SET password = $1, reset_password_token = NULL, reset_password_expires = NULL WHERE id = $2',
            [hashedPassword, user.id]
        );

        return res.status(200).json({ message: 'Senha alterada com sucesso!' });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Erro ao redefinir senha.' });
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
    const { id } = req.params;

    const user = await db.query(
      'SELECT id, name, email, role, created_at FROM users WHERE id = $1',
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
