interface StoredProject {
    projectId: string;
    projectName: string;
    timestamp: number;
}

const STORAGE_KEY = 'activeProject';

export const ProjectStateManager = {
    saveProject(projectId: string, projectName: string): boolean {
        const data: StoredProject = { projectId, projectName, timestamp: Date.now() };
        try {
            const url = new URL(window.location.href);
            url.searchParams.set('project', projectId);
            url.searchParams.set('name', encodeURIComponent(projectName));
            window.history.replaceState({}, '', url.toString());


            localStorage?.setItem?.(STORAGE_KEY, JSON.stringify(data));
            sessionStorage?.setItem?.(STORAGE_KEY, JSON.stringify(data));
            return true;
        } catch (err) {
            console.warn('Failed to save project state:', err);
            return false;
        }
    },

    loadProject(): { projectId: string; projectName: string } | null {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const projectFromUrl = urlParams.get('project');
            const nameFromUrl = urlParams.get('name');


            if (projectFromUrl && nameFromUrl) {
                return { projectId: projectFromUrl, projectName: decodeURIComponent(nameFromUrl) };
            }


            const data =
                localStorage?.getItem?.(STORAGE_KEY) ?? sessionStorage?.getItem?.(STORAGE_KEY) ?? null;


            if (data) {
                const parsed = JSON.parse(data) as StoredProject;
                if (Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000) {
                    return { projectId: parsed.projectId, projectName: parsed.projectName };
                }
            }


            return null;
        } catch (err) {
            console.warn('Failed to load project state:', err);
            return null;
        }
    },

    clearProject(): void {
        try {
            localStorage?.removeItem?.(STORAGE_KEY);
            sessionStorage?.removeItem?.(STORAGE_KEY);


            const url = new URL(window.location.href);
            url.searchParams.delete('project');
            url.searchParams.delete('name');
            window.history.replaceState({}, '', url.pathname);
        } catch (err) {
            console.warn('Failed to clear project state:', err);
        }
    },
};