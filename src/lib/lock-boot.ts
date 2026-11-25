/** Clés du verrou Face ID, partagées entre le script de démarrage (serveur) et le navigateur. */
export const LOCK_KEY = "atlas:lock";
export const UNLOCKED_KEY = "atlas:unlocked";
/** Posée juste avant d'entrer dans l'app depuis la connexion : l'app arrive floue puis se pose. */
export const ARRIVAL_KEY = "atlas:arrival";

/**
 * Script exécuté avant l'affichage. Verrouillé : la page est voilée et l'app floutée derrière.
 * Arrivée depuis la connexion : l'app démarre floue, prête à se poser.
 */
export const LOCK_BOOT_SCRIPT = `try{var d=document.documentElement;if(location.pathname!=="/login"){if(localStorage.getItem("${LOCK_KEY}")&&!sessionStorage.getItem("${UNLOCKED_KEY}")){d.dataset.lock="1";d.dataset.reveal="start"}else if(sessionStorage.getItem("${ARRIVAL_KEY}")){d.dataset.reveal="start"}}}catch(e){}`;
