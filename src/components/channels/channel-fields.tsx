import { PODCAST_CATEGORIES } from "@/lib/rss";
import { Field, Input, Select, Textarea } from "../ui/form";

const CATEGORY_LABELS: Record<(typeof PODCAST_CATEGORIES)[number], string> = {
  Arts: "Artes",
  Business: "Negócios",
  Comedy: "Comédia",
  Education: "Educação",
  Fiction: "Ficção",
  "Health & Fitness": "Saúde e bem-estar",
  History: "História",
  "Kids & Family": "Crianças e família",
  Leisure: "Lazer",
  Music: "Música",
  News: "Notícias",
  "Religion & Spirituality": "Religião e espiritualidade",
  Science: "Ciência",
  "Society & Culture": "Sociedade e cultura",
  Sports: "Desporto",
  Technology: "Tecnologia",
  "True Crime": "Crime verídico",
  "TV & Film": "TV e cinema",
};

export interface ChannelFieldValues {
  title: string;
  description: string;
  authorName: string | null;
  category: string;
  explicit: boolean;
  published: boolean;
}

export function ChannelFields({
  values,
  showPublished = false,
}: {
  values?: ChannelFieldValues;
  showPublished?: boolean;
}) {
  return (
    <>
      <Field label="Nome do canal" htmlFor="title">
        <Input
          id="title"
          name="title"
          required
          maxLength={120}
          defaultValue={values?.title}
          placeholder="Ex.: Peripécias"
        />
      </Field>
      <Field label="Descrição" htmlFor="description" hint="Aparece na página do canal e nas apps de podcasts.">
        <Textarea
          id="description"
          name="description"
          maxLength={4000}
          rows={3}
          defaultValue={values?.description}
          placeholder="Histórias, desabafos e outras aventuras."
        />
      </Field>
      <Field label="Autor (opcional)" htmlFor="authorName" hint="Se ficar vazio, usamos o nome do canal.">
        <Input id="authorName" name="authorName" maxLength={120} defaultValue={values?.authorName ?? ""} />
      </Field>
      <Field label="Categoria" htmlFor="category">
        <Select id="category" name="category" defaultValue={values?.category ?? "Society & Culture"}>
          {PODCAST_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </Select>
      </Field>
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="explicit"
          defaultChecked={values?.explicit ?? false}
          className="mt-0.5 size-4 accent-[var(--primary)]"
        />
        <span>
          Conteúdo explícito
          <span className="block text-xs text-muted-foreground">Marca o feed como explícito nas apps de podcasts.</span>
        </span>
      </label>
      {showPublished ? (
        <label className="flex items-start gap-3 text-sm">
          <input type="hidden" name="hasPublishedField" value="1" />
          <input
            type="checkbox"
            name="published"
            defaultChecked={values?.published ?? true}
            className="mt-0.5 size-4 accent-[var(--primary)]"
          />
          <span>
            Canal ativo
            <span className="block text-xs text-muted-foreground">
              Se desativares, a página e o feed deixam de estar acessíveis (os links mantêm-se).
            </span>
          </span>
        </label>
      ) : null}
    </>
  );
}
