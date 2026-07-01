export function SidebarLogo() {
    return (
        <span className="flex items-center">
            <img
                src="/logo/favicon-light-32.png"
                alt="BLIT386"
                width={64}
                height={64}
                className="block dark:hidden [image-rendering:pixelated]"
            />
            <img
                src="/logo/favicon-dark-32.png"
                alt="BLIT386"
                width={64}
                height={64}
                className="hidden dark:block [image-rendering:pixelated]"
            />
        </span>
    );
}
