import styles from './sidebar-logo.module.css';

export function SidebarLogo() {
    return (
        <span className={styles.wrapper}>
            <img src="/logo/favicon-light-32.png" alt="BLIT386" width={64} height={64} className={styles.logoLight} />
            <img src="/logo/favicon-dark-32.png" alt="BLIT386" width={64} height={64} className={styles.logoDark} />
        </span>
    );
}
