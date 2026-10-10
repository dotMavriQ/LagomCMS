<?php

declare(strict_types=1);

namespace Lagom\Content;

use League\CommonMark\Environment\Environment;
use League\CommonMark\Extension\Autolink\AutolinkExtension;
use League\CommonMark\Extension\CommonMark\CommonMarkCoreExtension;
use League\CommonMark\Extension\CommonMark\Node\Block\BlockQuote;
use League\CommonMark\Extension\CommonMark\Node\Block\FencedCode;
use League\CommonMark\Extension\CommonMark\Node\Block\Heading;
use League\CommonMark\Extension\CommonMark\Node\Block\HtmlBlock;
use League\CommonMark\Extension\CommonMark\Node\Block\IndentedCode;
use League\CommonMark\Extension\CommonMark\Node\Block\ListBlock;
use League\CommonMark\Extension\CommonMark\Node\Block\ThematicBreak;
use League\CommonMark\Extension\CommonMark\Node\Inline\Code;
use League\CommonMark\Extension\CommonMark\Node\Inline\Emphasis;
use League\CommonMark\Extension\CommonMark\Node\Inline\HtmlInline;
use League\CommonMark\Extension\CommonMark\Node\Inline\Image;
use League\CommonMark\Extension\CommonMark\Node\Inline\Link;
use League\CommonMark\Extension\CommonMark\Node\Inline\Strong;
use League\CommonMark\Extension\Footnote\FootnoteExtension;
use League\CommonMark\Extension\Footnote\Node\Footnote;
use League\CommonMark\Extension\Footnote\Node\FootnoteContainer;
use League\CommonMark\Extension\Footnote\Node\FootnoteRef;
use League\CommonMark\Extension\Strikethrough\Strikethrough;
use League\CommonMark\Extension\Strikethrough\StrikethroughExtension;
use League\CommonMark\Extension\Table\Table;
use League\CommonMark\Extension\Table\TableCell;
use League\CommonMark\Extension\Table\TableExtension;
use League\CommonMark\Extension\Table\TableRow;
use League\CommonMark\Extension\Table\TableSection;
use League\CommonMark\Extension\TaskList\TaskListExtension;
use League\CommonMark\Node\Block\Paragraph;
use League\CommonMark\Node\Inline\Newline;
use League\CommonMark\Node\Inline\Text;
use League\CommonMark\Node\Node;
use League\CommonMark\Parser\MarkdownParser;

/**
 * Markdown in, blocks out.
 *
 * The API never serves a blob of HTML. It serves an ordered list of typed blocks
 * (paragraph, heading, list, code, ...) and leaves the HTML to whoever renders the
 * site. Text inside a block is a list of "spans": a run of text plus the marks on
 * it, so **bold** becomes {"text": "bold", "marks": ["strong"]}.
 *
 * Custom blocks (figure, gallery, embed) live in the Markdown as a fenced code
 * block whose info string starts with "lagom:". The rest of the info string is the
 * block type and the fence body is its JSON:
 *
 *     ```lagom:figure
 *     {"src": "/media/posts/hello/harbour.jpg", "alt": "Boats in the harbour"}
 *     ```
 *
 * Callouts need no JSON; they are a quote with a marker. See callout() below.
 *
 * The exact output shape is a contract with the frontend, and it is pinned by
 * tests/fixtures.php against what the previous (Lua) LagomCMS served in production.
 * If you change what a block looks like here, run that first.
 */
final class Blocks
{
    private const FENCE_PREFIX = 'lagom:';

    private MarkdownParser $parser;

    /** Footnote label as the author wrote it => its number, in order of first use. */
    private array $footnoteNumbers = [];

    /** Labels that have a definition somewhere in the document, as label => true. */
    private array $footnotesDefined = [];

    public function __construct()
    {
        // GitHub-flavoured Markdown, more or less: tables, ~~strikethrough~~, bare
        // URLs becoming links, task lists and footnotes on top of CommonMark.
        $environment = new Environment();
        $environment->addExtension(new CommonMarkCoreExtension());
        $environment->addExtension(new TableExtension());
        $environment->addExtension(new StrikethroughExtension());
        $environment->addExtension(new AutolinkExtension());
        $environment->addExtension(new TaskListExtension());
        $environment->addExtension(new FootnoteExtension());

        $this->parser = new MarkdownParser($environment);
    }

    /**
     * Parse a Markdown body into a list of blocks.
     *
     * @return list<array<string, mixed>>
     */
    public function parse(string $markdown): array
    {
        if ($markdown === '') {
            return [];
        }

        $document = $this->parser->parse($markdown);

        // Find the footnote definitions before anything else, so references can be
        // matched to them by label while the body is walked.
        $definitions = [];
        foreach ($document->children() as $node) {
            if ($node instanceof FootnoteContainer) {
                $definitions = iterator_to_array($node->children(), false);
            }
        }
        $this->footnoteNumbers = [];
        $this->footnotesDefined = [];
        foreach ($definitions as $definition) {
            if ($definition instanceof Footnote) {
                $this->footnotesDefined[$definition->getReference()->getLabel()] = true;
            }
        }

        // Footnote definitions are pulled out and appended at the end, numbered by
        // where they were first referenced rather than where they were written.
        // The body has to be walked first, because that walk is what assigns the
        // numbers.
        $blocks = [];
        foreach ($document->children() as $node) {
            if ($node instanceof FootnoteContainer) {
                continue;
            }
            $block = $this->block($node);
            if ($block !== null) {
                $blocks[] = $block;
            }
        }

        return array_merge($blocks, $this->footnoteDefinitions($definitions));
    }

    /**
     * The plain text of a block list, for excerpts and search.
     *
     * With a limit, the text is cut at the last whole word that fits and gets
     * "..." appended. Lengths are counted in bytes, not characters. That is not
     * a principled choice, it is what the old CMS did, and excerpts would change
     * under everybody's feet if we counted differently.
     *
     * @param list<array<string, mixed>> $blocks
     */
    public static function toText(array $blocks, ?int $limit = null): string
    {
        $parts = [];
        $length = 0;
        self::collectText($blocks, $limit, $parts, $length);

        $text = trim(preg_replace('/[ \t\n\v\f\r]+/', ' ', implode('', $parts)) ?? '', " \t\n\v\f\r");

        if ($limit !== null && strlen($text) > $limit) {
            $cut = substr($text, 0, $limit);
            $text = (preg_replace('/[ \t\n\v\f\r]+[^ \t\n\v\f\r]*$/', '', $cut) ?? $cut) . '...';

            // A byte cut can land in the middle of a multi-byte character.
            $text = mb_convert_encoding($text, 'UTF-8', 'UTF-8');
        }

        return $text;
    }

    /**
     * How many words a block list holds. Table cells and code are not counted,
     * because nobody reads those at reading speed.
     *
     * @param list<array<string, mixed>> $blocks
     */
    public static function countWords(array $blocks): int
    {
        $words = 0;
        foreach ($blocks as $block) {
            foreach ($block['spans'] ?? [] as $span) {
                $words += preg_match_all('/[^ \t\n\v\f\r]+/', (string) ($span['text'] ?? ''));
            }
            if (isset($block['blocks'])) {
                $words += self::countWords($block['blocks']);
            }
            foreach ($block['items'] ?? [] as $item) {
                $words += self::countWords($item['blocks']);
            }
        }

        return $words;
    }

    /**
     * Turn one block-level node into a block, or null for a node we do not serve.
     *
     * @return array<string, mixed>|null
     */
    private function block(Node $node): ?array
    {
        if ($node instanceof Paragraph) {
            return ['type' => 'paragraph', 'spans' => $this->spans($node)];
        }

        if ($node instanceof Heading) {
            return ['type' => 'heading', 'level' => $node->getLevel(), 'spans' => $this->spans($node)];
        }

        if ($node instanceof FencedCode) {
            $info = $node->getInfo() ?? '';
            if (str_starts_with($info, self::FENCE_PREFIX)) {
                return $this->customBlock($info, $node->getLiteral());
            }

            return $this->codeBlock($info, $node->getLiteral());
        }

        if ($node instanceof IndentedCode) {
            return $this->codeBlock('', $node->getLiteral());
        }

        if ($node instanceof BlockQuote) {
            $blocks = $this->blocks($node);

            return $this->callout($blocks) ?? ['type' => 'blockquote', 'blocks' => $blocks];
        }

        if ($node instanceof ListBlock) {
            return $this->listBlock($node);
        }

        if ($node instanceof ThematicBreak) {
            return ['type' => 'thematic_break'];
        }

        if ($node instanceof HtmlBlock) {
            // Ends in a newline, like the code blocks below and for the same reason.
            return ['type' => 'html', 'html' => rtrim($node->getLiteral(), "\n") . "\n"];
        }

        if ($node instanceof Table) {
            return $this->tableBlock($node);
        }

        return null;
    }

    /**
     * Every child of a container (blockquote, list item, footnote) as blocks.
     *
     * @return list<array<string, mixed>>
     */
    private function blocks(Node $parent): array
    {
        $blocks = [];
        foreach ($parent->children() as $child) {
            $block = $this->block($child);
            if ($block !== null) {
                $blocks[] = $block;
            }
        }

        return $blocks;
    }

    /** @return array<string, mixed> */
    private function codeBlock(string $info, string $text): array
    {
        $block = ['type' => 'code'];
        if ($info !== '') {
            $block['language'] = $info;
        }

        // The frontend expects the text to end in a newline, as it would in a file.
        $block['text'] = str_ends_with($text, "\n") ? $text : $text . "\n";

        return $block;
    }

    /**
     * A ```lagom:<type> fence. The body is that block's JSON.
     *
     * JSON that does not parse becomes a parse_error block holding the raw text.
     * Content is never dropped over a syntax error: if it were, the next save from
     * the editor would quietly delete what the author wrote.
     *
     * @return array<string, mixed>
     */
    private function customBlock(string $info, string $body): array
    {
        preg_match('/^(\S+)/', substr($info, strlen(self::FENCE_PREFIX)), $found);
        $type = $found[1] ?? '';

        $decoded = json_decode($body, true);
        if (!is_array($decoded)) {
            return [
                'type' => 'parse_error',
                'block_type' => $type,
                'raw' => $body,
                'error' => json_last_error() !== JSON_ERROR_NONE
                    ? json_last_error_msg()
                    : 'fence body must be a JSON object',
            ];
        }

        // The fence decides the type. A "type" key inside the JSON does not get a vote.
        $decoded['type'] = $type;

        return $decoded;
    }

    /**
     * A callout is a quote whose first line is a marker, the way Obsidian and
     * GitHub write them:
     *
     *     > [!warning] Back up first
     *     > This rewrites every file in the folder.
     *
     * That gives {type: callout, tone: "warning", title: "Back up first", blocks: [...]}.
     * It stays valid Markdown: anything that does not know about callouts shows a
     * quote that happens to start with "[!warning]". Returns null for a plain quote.
     *
     * @param list<array<string, mixed>> $blocks the quote's contents, already converted
     *
     * @return array<string, mixed>|null
     */
    private function callout(array $blocks): ?array
    {
        $first = $blocks[0] ?? null;
        $opening = $first['spans'][0]['text'] ?? '';
        if (($first['type'] ?? '') !== 'paragraph' || !preg_match('/^\[!(\w+)\][ \t]*(.*)$/s', $opening, $found)) {
            return null;
        }

        // The title is the rest of the marker's line. A line break inside a paragraph
        // arrives as a span holding one space, so everything up to the first of
        // those is title and everything after it is the first paragraph of the body.
        $spans = $first['spans'];
        $spans[0]['text'] = $found[2];
        $title = '';
        $rest = [];
        foreach ($spans as $i => $span) {
            if ($i > 0 && ($span['text'] ?? null) === ' ' && !isset($span['marks'])) {
                $rest = array_slice($spans, $i + 1);
                break;
            }
            $title .= $span['text'] ?? '';
        }

        $body = array_slice($blocks, 1);
        if ($rest !== []) {
            array_unshift($body, ['type' => 'paragraph', 'spans' => $rest]);
        }

        $callout = ['type' => 'callout', 'tone' => strtolower($found[1])];
        if (trim($title) !== '') {
            $callout['title'] = trim($title);
        }
        $callout['blocks'] = $body;

        return $callout;
    }

    /** @return array<string, mixed> */
    private function listBlock(ListBlock $node): array
    {
        $ordered = $node->getListData()->type === ListBlock::TYPE_ORDERED;

        $block = ['type' => 'list', 'ordered' => $ordered];
        if ($ordered) {
            $block['start'] = $node->getListData()->start ?? 1;
        }

        // An item is always a list of blocks, even when it is one short line,
        // so a renderer never has to guess which shape it got.
        $block['items'] = [];
        foreach ($node->children() as $item) {
            $block['items'][] = ['blocks' => $this->blocks($item)];
        }

        return $block;
    }

    /**
     * Rows of cells. The header row is flagged rather than split off into its own
     * key, so a table is always just a list of rows.
     *
     * @return array<string, mixed>
     */
    private function tableBlock(Table $node): array
    {
        $rows = [];
        foreach ($node->children() as $section) {
            if (!$section instanceof TableSection) {
                continue;
            }
            foreach ($section->children() as $row) {
                if (!$row instanceof TableRow) {
                    continue;
                }
                $cells = [];
                foreach ($row->children() as $cell) {
                    if ($cell instanceof TableCell) {
                        $cells[] = ['spans' => $this->spans($cell)];
                    }
                }
                $rows[] = ['header' => $section->isHead(), 'cells' => $cells];
            }
        }

        return ['type' => 'table', 'rows' => $rows];
    }

    /**
     * Footnote definitions, in the order they were first referenced.
     *
     * A definition nobody references is left out, same as GitHub does.
     *
     * @param list<Node> $definitions
     *
     * @return list<array<string, mixed>>
     */
    private function footnoteDefinitions(array $definitions): array
    {
        $numbered = [];
        foreach ($definitions as $definition) {
            if (!$definition instanceof Footnote) {
                continue;
            }
            $number = $this->footnoteNumbers[$definition->getReference()->getLabel()] ?? null;
            if ($number === null) {
                continue;
            }
            $numbered[$number] = [
                'type' => 'footnote_definition',
                'blocks' => $this->blocks($definition),
                'label' => (string) $number,
            ];
        }
        ksort($numbered);

        return array_values($numbered);
    }

    /**
     * The inline content of a node, flattened into spans.
     *
     * @return list<array<string, mixed>>
     */
    private function spans(Node $node): array
    {
        $spans = [];
        $this->collectSpans($node, [], null, $spans);

        return $spans;
    }

    /**
     * Walk inline nodes, carrying the marks collected on the way down.
     *
     * Nested formatting is flattened: a link inside bold text is one span with
     * marks ["strong", "link"], outermost first.
     *
     * @param list<string>               $marks
     * @param list<array<string, mixed>> $spans
     */
    private function collectSpans(Node $node, array $marks, ?string $href, array &$spans): void
    {
        // The parser sometimes hands over one run of text in several pieces (an
        // unmatched bracket is its own piece, for example). Readers of the block tree
        // should not have to care, so neighbouring pieces are joined back up.
        $previousWasText = false;

        foreach ($node->children() as $child) {
            if ($child instanceof Text) {
                if ($previousWasText) {
                    $spans[count($spans) - 1]['text'] .= $child->getLiteral();
                } else {
                    $spans[] = $this->span($child->getLiteral(), $marks, $href);
                }
                $previousWasText = true;
                continue;
            }
            $previousWasText = false;

            if ($child instanceof Code) {
                $spans[] = $this->span($child->getLiteral(), [...$marks, 'code'], $href);
            } elseif ($child instanceof Newline) {
                // A line break inside a paragraph is just a space, unless the
                // author forced one with two trailing spaces or a backslash.
                $spans[] = ['text' => $child->getType() === Newline::HARDBREAK ? "\n" : ' '];
            } elseif ($child instanceof Emphasis) {
                $this->collectSpans($child, [...$marks, 'em'], $href, $spans);
            } elseif ($child instanceof Strong) {
                $this->collectSpans($child, [...$marks, 'strong'], $href, $spans);
            } elseif ($child instanceof Strikethrough) {
                $this->collectSpans($child, [...$marks, 'strike'], $href, $spans);
            } elseif ($child instanceof Link) {
                $from = count($spans);
                $this->collectSpans($child, [...$marks, 'link'], $child->getUrl(), $spans);

                // [text](url "title"): the title rides along on every span of the link.
                // The site reads one title specially: "me" marks a link to the author's
                // own profile (rel="me"), which is otherwise impossible to say in Markdown.
                if ($child->getTitle() !== null && $child->getTitle() !== '') {
                    for ($i = $from; $i < count($spans); $i++) {
                        $spans[$i]['title'] = $child->getTitle();
                    }
                }
            } elseif ($child instanceof Image) {
                $spans[] = ['type' => 'image', 'src' => $child->getUrl(), 'alt' => $this->plainText($child)];
            } elseif ($child instanceof HtmlInline) {
                $spans[] = $this->span($child->getLiteral(), [...$marks, 'html'], null);
            } elseif ($child instanceof FootnoteRef) {
                $spans[] = $this->footnoteReference($child, $marks);
            }
            // Anything else (task list checkboxes, the "back to text" arrows the
            // footnote extension adds) has no place in the block tree.
        }
    }

    /**
     * @param list<string> $marks
     *
     * @return array<string, mixed>
     */
    private function span(string $text, array $marks, ?string $href): array
    {
        $span = ['text' => $text];
        if ($marks !== []) {
            $span['marks'] = $marks;
        }
        if ($href !== null) {
            $span['href'] = $href;
        }

        return $span;
    }

    /**
     * A footnote reference is a span of its own, not a mark on nearby text: it has
     * no text in the document, only a number, and what the reader sees in its
     * place is up to the renderer.
     *
     * @param list<string> $marks
     *
     * @return array<string, mixed>
     */
    private function footnoteReference(FootnoteRef $node, array $marks): array
    {
        // When a footnote is referenced a second time, the parser renames the
        // reference to "label__2" so its HTML ids stay unique. We want the footnote
        // it points at, so the suffix comes off again.
        $label = $node->getReference()->getLabel();
        if (!isset($this->footnotesDefined[$label])) {
            $label = preg_replace('/__\d+$/', '', $label) ?? $label;
        }

        if (!isset($this->footnoteNumbers[$label])) {
            $this->footnoteNumbers[$label] = count($this->footnoteNumbers) + 1;
        }

        $span = ['type' => 'footnote_reference', 'label' => (string) $this->footnoteNumbers[$label]];
        if ($marks !== []) {
            $span['marks'] = $marks;
        }

        return $span;
    }

    /** The text of a node with all formatting thrown away. Used for image alt text. */
    private function plainText(Node $node): string
    {
        $text = '';
        foreach ($node->children() as $child) {
            if ($child instanceof Text || $child instanceof Code) {
                $text .= $child->getLiteral();
            } else {
                $text .= $this->plainText($child);
            }
        }

        return $text;
    }

    /**
     * @param list<array<string, mixed>> $blocks
     * @param list<string>               $parts
     */
    private static function collectText(array $blocks, ?int $limit, array &$parts, int &$length): void
    {
        foreach ($blocks as $block) {
            if (isset($block['spans'])) {
                foreach ($block['spans'] as $span) {
                    if (isset($span['text'])) {
                        $parts[] = $span['text'];
                        $length += strlen($span['text']);
                    }
                }
                $parts[] = ' ';
            } elseif (isset($block['blocks'])) {
                self::collectText($block['blocks'], $limit, $parts, $length);
            } elseif (isset($block['items'])) {
                foreach ($block['items'] as $item) {
                    self::collectText($item['blocks'], $limit, $parts, $length);
                }
            }

            // No point reading a 5,000 word post to build a 200 byte excerpt.
            if ($limit !== null && $length > $limit) {
                return;
            }
        }
    }
}
