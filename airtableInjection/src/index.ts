(() => {
    console.log('injectin')
    if ((window as any).__airtableExtractorInstalled) return;
    (window as any).__airtableExtractorInstalled = true;
    console.log('injecting __airtableExtractorInstalled')
    interface AirtableCard {
        age: number;
        title: string;
        description: string;
        thumbs: {
            small: string;
            medium: string;
        };
        download: string;
        created_at?: string;
        updated_at?: string;
        awards: string[];
        tags: string[];
    }

    const getText = (el: Element): string => el?.textContent?.trim();

    /**
     * 🔥 CORE FIX: properly locate the VALUE container
     */
    const getFieldContainer = (card: Element, label: string): Element => {
        const labelEl = card.querySelector(`[title="${label}"]`);
        if (!labelEl) return null;

        // go to the block wrapper
        const block = labelEl.closest('div[style*="padding-top"]');
        if (!block) return;

        // THIS is the reliable container
        return block.querySelector('.cellContainer .cell');
    };

    /**
     * TEXT FIELD (description, age, etc.)
     */
    const getFieldText = (card: Element, label: string): string => {
        const container = getFieldContainer(card, label);
        if (!container) return;

        // grab deepest meaningful text node
        const valueEl = container.querySelector('.truncate-block-4-lines, .flex-auto, .truncate') || container;

        return getText(valueEl);
    };

    /**
     * MULTI SELECT (tags, awards)
     */
    const getFieldMulti = (card: Element, label: string): string[] => {
        const container = getFieldContainer(card, label);
        if (!container) return [];

        return Array.from(container.querySelectorAll('[title]'))
            .map((el) => el.getAttribute('title'))
            .filter((v): v is string => !!v);
    };

    /**
     * DATE FIELD (special case: split date + time)
     */
    const getFieldDateTime = (card: Element, label: string): string => {
        const container = getFieldContainer(card, label);
        if (!container) return null;

        const parts = Array.from(container.querySelectorAll('div'))
            .map((el) => el.textContent?.trim())
            .filter(Boolean);
        return parts.slice(1).join(' ');
    };

    const extractCardFromLink = (link: HTMLAnchorElement): AirtableCard => {
        const card = link.closest('[role="presentation"]');
        if (!card) return null;

        const titleEl = card.querySelector('a.galleryCardPrimaryCell');
        const img = card.querySelector('img');

        return {
            age: (() => {
                const val = getFieldText(card, 'Âge');
                return val ? Number(val) : null;
            })(),
            title: getText(titleEl),
            description: getFieldText(card, 'Description'),
            thumbs: {
                small: img?.getAttribute('src'),
                medium: img?.getAttribute('src')
            },
            download: link.href,
            updated_at: getFieldDateTime(card, 'Dernière modification'),
            awards: getFieldMulti(card, 'Award'),
            tags: getFieldMulti(card, 'Mots-clés')
        };
    };

    const findMegaLink = (url: string): HTMLAnchorElement => {
        const links = Array.from(document.querySelectorAll('a[href*="mega.nz"]'));

        return links.find((l) => l['href'] === url) as any;
    };

    (window as any).__extractAirtableCardFromMega = (url: string): string => {
        try {
            const link = findMegaLink(url);

            if (!link) {
                return JSON.stringify({ error: 'LINK_NOT_FOUND', url });
            }

            const data = extractCardFromLink(link);

            if (!data) {
                return JSON.stringify({ error: 'CARD_NOT_FOUND', url });
            }

            return JSON.stringify(data);
        } catch (err: any) {
            return JSON.stringify({
                error: 'EXTRACTION_FAILED',
                message: err?.message || String(err)
            });
        }
    };

    console.log('[Airtable Extractor] Deep extractor ready');
})();
