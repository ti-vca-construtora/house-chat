const supabase = require('../database/supabase');

async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token não fornecido' });
    }

    const token = authHeader.split(' ')[1];

    const {
      data: { user: authUser },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !authUser) {
      return res.status(401).json({ error: 'Token inválido ou expirado' });
    }

    let { data: user, error } = await supabase
      .from('users')
      .select('id, email, role, daily_message_count, last_message_date')
      .eq('id', authUser.id)
      .single();

    if (error && error.code !== 'PGRST116') {
      return next(error);
    }

    if (!user) {
      const { data: createdUser, error: createError } = await supabase
        .from('users')
        .upsert(
          {
            id: authUser.id,
            email: authUser.email,
            role: 'corretor',
          },
          { onConflict: 'id' }
        )
        .select('id, email, role, daily_message_count, last_message_date')
        .single();

      if (createError || !createdUser) {
        return res.status(401).json({ error: 'Usuário não encontrado' });
      }

      user = createdUser;
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = authMiddleware;
