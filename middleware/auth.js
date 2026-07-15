// Oturum ve rol bazlı yetki kontrolü.

function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.redirect('/giris');
}

// requireRole('admin') veya requireRole('admin','coordinator')
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session || !req.session.user) return res.redirect('/giris');
    if (!roles.includes(req.session.user.role)) {
      return res.status(403).render('error', {
        user: req.session.user,
        title: 'Yetkisiz Erişim',
        message: 'Bu sayfaya erişim yetkiniz bulunmuyor.',
      });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
