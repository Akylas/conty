<script>
    import PacksList from './PacksList.svelte';
</script>

<page actionBarHidden={true}>
    <gridlayout id="inner-frame-holder">
        <frame id="inner-frame">
            <PacksList />
        </frame>
    </gridlayout>
</page>
