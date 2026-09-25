use std::path::{Component, Path, PathBuf};
use tauri::{AppHandle, Manager};

/// Racine des données de l'application.
/// - En dev : le dossier `data/` du projet (Comptal2.1/data), pour garder les
///   données visibles et versionnables pendant le développement.
/// - En production : `%APPDATA%/com.leopaul.comptal21/data`.
pub fn data_root(app: &AppHandle) -> PathBuf {
    if cfg!(debug_assertions) {
        let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        manifest
            .parent()
            .expect("src-tauri doit avoir un parent")
            .join("data")
    } else {
        app.path()
            .app_data_dir()
            .expect("app_data_dir indisponible")
            .join("data")
    }
}

fn strip_verbatim(path: &Path) -> PathBuf {
    let text = path.to_string_lossy();
    #[cfg(windows)]
    {
        if let Some(rest) = text.strip_prefix(r"\\?\") {
            return PathBuf::from(rest);
        }
    }
    PathBuf::from(text.as_ref())
}

/// Compare un enfant canonique à un parent (insensible à la casse sous Windows).
pub fn is_under(parent: &Path, child: &Path) -> bool {
    let parent_n = strip_verbatim(parent);
    let child_n = strip_verbatim(child);
    #[cfg(windows)]
    {
        let parent_s = parent_n.to_string_lossy().to_lowercase();
        let child_s = child_n.to_string_lossy().to_lowercase();
        let parent_s = parent_s.trim_end_matches(['\\', '/']);
        child_s == parent_s
            || child_s.starts_with(&format!("{parent_s}\\"))
            || child_s.starts_with(&format!("{parent_s}/"))
    }
    #[cfg(not(windows))]
    {
        child_n.starts_with(&parent_n)
    }
}

pub fn canonicalize_existing(path: &Path) -> Result<PathBuf, String> {
    path.canonicalize()
        .map_err(|e| format!("Chemin introuvable: {e}"))
}

/// Résout un chemin relatif sous la racine de données.
/// Refuse les chemins vides, `.`, `..`, absolus et les préfixes Windows type `\...`.
pub fn resolve(app: &AppHandle, rel: &str) -> Result<PathBuf, String> {
    let trimmed = rel.trim();
    if trimmed.is_empty() || trimmed == "." || trimmed == ".." {
        return Err(format!("Chemin relatif refusé: {rel}"));
    }
    if trimmed.starts_with('\\') || trimmed.starts_with('/') {
        return Err(format!("Préfixe racine refusé: {rel}"));
    }
    if trimmed.contains('\0') {
        return Err(format!("Chemin relatif refusé: {rel}"));
    }
    let rel_path = Path::new(rel);
    if rel_path.is_absolute() {
        return Err(format!("Chemin absolu refusé: {rel}"));
    }
    for comp in rel_path.components() {
        match comp {
            Component::ParentDir
            | Component::RootDir
            | Component::Prefix(_)
            | Component::CurDir => {
                return Err(format!("Chemin relatif refusé: {rel}"));
            }
            _ => {}
        }
    }
    Ok(data_root(app).join(rel_path))
}
