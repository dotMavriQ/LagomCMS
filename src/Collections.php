<?php

declare(strict_types=1);

namespace Lagom;

/**
 * The content model: which collections exist and what fields they have.
 *
 * Each file in collections/ returns one plain array describing a collection
 * (posts, projects, cv_roles, ...). There is no DSL and no code generation; if you
 * want a new field on posts, you add a line to collections/posts.php.
 *
 * A "singleton" is a collection with exactly one document and no slug, such as the
 * site settings or the home page. It lives at content/<name>/index.md rather than
 * content/<name>/<slug>/index.md.
 */
final class Collections
{
    /**
     * SEO fields every page-like collection gets without having to declare them.
     * A collection that defines a field of the same name keeps its own.
     */
    private const SEO_FIELDS = [
        ['name' => 'seo_title', 'type' => 'text', 'label' => 'SEO title',
            'help' => 'Overrides the title in search results. Around 60 characters.'],
        ['name' => 'seo_description', 'type' => 'text', 'label' => 'SEO description',
            'help' => 'The sentence shown under the title in search results.'],
        ['name' => 'canonical', 'type' => 'text', 'label' => 'Canonical URL',
            'help' => 'Set when this page duplicates another. Usually left empty.'],
        ['name' => 'noindex', 'type' => 'boolean', 'label' => 'Hide from search',
            'help' => 'Ask search engines not to index this page'],
    ];

    /** @var array<string, array<string, mixed>> definitions keyed by collection name */
    private array $definitions = [];

    public function __construct(string $directory)
    {
        foreach (glob($directory . '/*.php') ?: [] as $file) {
            $definition = require $file;
            $this->definitions[$definition['name']] = $this->complete($definition);
        }

        // The order they appear in the admin sidebar.
        uasort($this->definitions, fn (array $a, array $b): int => $a['order'] <=> $b['order']);
    }

    /** @return array<string, mixed>|null */
    public function get(string $name): ?array
    {
        return $this->definitions[$name] ?? null;
    }

    /** @return array<string, array<string, mixed>> */
    public function all(): array
    {
        return $this->definitions;
    }

    /**
     * A collection together with the ones that hang off it, in menu order: the
     * parent first, then its children. A collection with no relatives gives a
     * family of one, and the admin then draws no tabs at all.
     *
     * @return list<array<string, mixed>>
     */
    public function family(string $name): array
    {
        $head = $this->definitions[$name]['parent'] ?? $name;

        $family = [];
        foreach ($this->definitions as $definition) {
            if ($definition['name'] === $head || $definition['parent'] === $head) {
                $family[] = $definition;
            }
        }

        return $family;
    }

    public function isSingleton(string $name): bool
    {
        return ($this->definitions[$name]['singleton'] ?? false) === true;
    }

    /**
     * May this person do this to this document?
     *
     * $role is null for an anonymous visitor. Reading is the only thing an
     * anonymous visitor can ever do, and for 'published' collections only once
     * the document's status says so. That one rule is what keeps drafts private.
     */
    public function allows(string $name, string $action, ?Role $role, ?string $status = null): bool
    {
        $rule = $this->definitions[$name]['access'][$action] ?? null;

        if ($action === 'read') {
            return $rule === 'public' || $status === 'published' || $role !== null;
        }

        // An action the collection does not list is not on offer to anyone.
        // You cannot delete the site settings, for instance.
        if ($rule === null || $role === null) {
            return false;
        }

        return $role->isAtLeast(Role::from($rule));
    }

    /**
     * Fill in everything a definition is allowed to leave out, so the rest of
     * the code never has to ask "is this key set?".
     *
     * @param array<string, mixed> $definition
     *
     * @return array<string, mixed>
     */
    private function complete(array $definition): array
    {
        $definition += [
            'label' => $definition['name'],
            'group' => 'Content',
            'order' => 100,
            'singleton' => false,
            // Hidden collections are left out of the admin's menu and quick switcher.
            'hidden' => false,
            // A collection with a parent is not in the menu itself; it is a tab on
            // its parent's screen. 'tab' is what the parent's own tab is called.
            'parent' => null,
            // A sentence shown at the top of the collection's screens, for things
            // the person editing needs to know before they start.
            'notice' => null,
        ];
        $definition += ['tab' => $definition['label']];
        $definition['body'] = ($definition['body'] ?? []) + ['enabled' => false];

        // SEO fields go on things that become pages: anything with a body that is
        // not a singleton. A collection can overrule that with 'seo' => true/false.
        $wantsSeo = $definition['seo'] ?? ($definition['body']['enabled'] && !$definition['singleton']);
        if ($wantsSeo) {
            $taken = array_column($definition['fields'], 'name');
            foreach (self::SEO_FIELDS as $field) {
                if (!in_array($field['name'], $taken, true)) {
                    $definition['fields'][] = $field;
                }
            }
        }

        foreach ($definition['fields'] as $i => $field) {
            $definition['fields'][$i] = $field + [
                // "published_at" reads as "Published at" unless a label says otherwise.
                'label' => ucfirst(str_replace('_', ' ', $field['name'])),
                // Quiet fields are hidden in the editor while they are empty.
                'quiet' => false,
                'required' => false,
                'multiple' => false,
                'list' => false,
                'sortable' => false,
                'filterable' => false,
            ];
        }

        return $definition;
    }
}
