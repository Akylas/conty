(() => {
    if ((window as any).__rmuhExtractorInstalled) return;
    (window as any).__rmuhExtractorInstalled = true;

    interface RmuhCard {
        age: number;
        title: string;
        description: string;
        thumbs: {
            small: string;
            medium: string;
        };
        download: string;
        updated_at: string;
        awards: string[];
        tags: string[];
    }

    interface RmuhFields {
        age?: number;
        title?: string;
        description?: string;
        image?: string;
        updated_at?: string;
        awards?: string[];
        tags?: string[];
    }

    // the page renders "-" for the fields it has no value for
    const text = (element: Element): string => {
        const value = element?.textContent?.trim();
        return value && value !== '-' ? value : null;
    };

    const textById = (id: string): string => text(document.getElementById(id));

    const absolute = (url: string): string => (url ? new URL(url, location.origin).href : null);

    const splitList = (value: string): string[] =>
        value
            ? value
                  .split(',')
                  .map((entry) => entry.trim())
                  .filter(Boolean)
            : [];

    const toNumber = (value: string): number => {
        const parsed = Number(value);
        return value && Number.isFinite(parsed) ? parsed : null;
    };

    // the "Modifié" column renders as DD/MM/YYYY, which dayjs would read as MM/DD/YYYY on the app side
    const toIsoDate = (value: string): string => {
        const parts = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value || '');
        return parts ? new Date(Date.UTC(+parts[3], +parts[2] - 1, +parts[1])).toISOString() : null;
    };

    const imageUrl = (image: Element): string => absolute(image?.getAttribute('src'));

    /** Table layout: one row per story, columns identified by their `<thead>` label. */
    const fromRow = (row: Element): RmuhFields => {
        const labels = Array.from(document.querySelectorAll('thead th')).map((header) => header.textContent.trim());
        const cell = (label: string): Element => {
            const index = labels.indexOf(label);
            return index === -1 ? null : row.children[index];
        };
        // the title cell also holds a "Nouveau" badge
        const title = cell('Titre')?.querySelector('button.story-open')?.cloneNode(true) as Element;
        title?.querySelectorAll('.badge-new').forEach((badge) => badge.remove());

        return {
            age: toNumber(text(cell('Âge'))),
            title: text(title),
            // truncated to 100 chars by the page, the modal holds the full one
            description: text(cell('Description')),
            image: imageUrl(cell('Image')?.querySelector('img')),
            updated_at: toIsoDate(text(cell('Modifié')))
        };
    };

    /** Detail modal: same story, with the full description and the award/category fields. */
    const fromModal = (): RmuhFields => ({
        age: toNumber(textById('modalAge')),
        title: textById('modalFullTitle') || textById('modalTitle'),
        description: textById('modalDescription'),
        image: imageUrl(document.getElementById('modalImage')),
        awards: splitList(textById('modalAward')),
        tags: splitList(textById('modalCategory'))
    });

    const modalShows = (url: string): boolean => Array.from(document.querySelectorAll<HTMLAnchorElement>('#modalDownloads a')).some((link) => link.href === url);

    /** The row only holds a truncated description, opening the story fills the modal with the full one. */
    const openModal = (row: Element, url: string): boolean => {
        const opener = row.querySelector<HTMLElement>('button.story-open');
        opener?.click();
        return modalShows(url);
    };

    const extract = (url: string): RmuhCard => {
        // the same story can be shown in the table and in the modal at once, so gather both
        const row = Array.from(document.querySelectorAll<HTMLAnchorElement>('a.download-link'))
            .filter((link) => link.href === url)
            .map((link) => link.closest('tr'))
            .find(Boolean);
        let inModal = modalShows(url);
        const openedModal = !inModal && !!row && openModal(row, url);
        inModal = inModal || openedModal;

        if (!row && !inModal) {
            return null;
        }

        try {
            const rowFields = row ? fromRow(row) : {};
            // the modal is the richer source, the row is the only one holding the date
            const modalFields = inModal ? fromModal() : {};
            const pick = (key: keyof RmuhFields) => modalFields[key] ?? rowFields[key] ?? null;
            const image = pick('image') as string;

            return {
                age: pick('age') as number,
                title: pick('title') as string,
                description: pick('description') as string,
                thumbs: {
                    small: image,
                    medium: image
                },
                download: url,
                updated_at: pick('updated_at') as string,
                awards: (pick('awards') as string[]) || [],
                tags: (pick('tags') as string[]) || []
            };
        } finally {
            if (openedModal) {
                document.getElementById('closeModal')?.click();
            }
        }
    };

    (window as any).__extractRmuhCardFromDownload = (url: string): string => {
        try {
            const card = extract(url);
            console.log('[RMUH Extractor] extract', url, JSON.stringify(card));

            return JSON.stringify(card || { error: 'ITEM_NOT_FOUND', url });
        } catch (err: any) {
            return JSON.stringify({
                error: 'EXTRACTION_FAILED',
                message: err?.message || String(err)
            });
        }
    };

    console.log('[RMUH Extractor] ready');
})();
