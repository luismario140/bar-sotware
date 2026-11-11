package com.appbarpos.catalog.infrastructure;

import com.appbarpos.catalog.application.CatalogException;
import com.appbarpos.infrastructure.storage.AppDataPaths;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Base64;
import java.util.Set;
import java.util.UUID;
import javax.imageio.ImageIO;
import javax.imageio.stream.MemoryCacheImageInputStream;
import org.springframework.stereotype.Component;

@Component
public class ProductImages {
    private final Path directory;
    public ProductImages(AppDataPaths paths) { directory = paths.root().resolve("media/productos"); }

    public byte[] normalize(String base64) {
        if (base64.length() > 7_000_000) throw CatalogException.invalid("La imagen supera el máximo de 5 MiB.");
        byte[] bytes;
        try { bytes = Base64.getDecoder().decode(base64); }
        catch (IllegalArgumentException exception) { throw CatalogException.invalid("El archivo de imagen no es válido."); }
        if (bytes.length == 0 || bytes.length > 5 * 1024 * 1024) throw CatalogException.invalid("La imagen debe ocupar como máximo 5 MiB.");
        try (var input = new MemoryCacheImageInputStream(new ByteArrayInputStream(bytes))) {
            var readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) throw CatalogException.invalid("Selecciona una imagen PNG o JPEG válida.");
            var reader = readers.next();
            try {
                if (!Set.of("png", "jpeg", "jpg").contains(reader.getFormatName().toLowerCase(java.util.Locale.ROOT))) {
                    throw CatalogException.invalid("Solo se admiten imágenes PNG o JPEG.");
                }
                reader.setInput(input, true, true);
                int width = reader.getWidth(0), height = reader.getHeight(0);
                if (width < 1 || height < 1 || width > 4096 || height > 4096 || (long) width * height > 10_000_000) {
                    throw CatalogException.invalid("La imagen supera 4096 píxeles por lado o 10 millones de píxeles.");
                }
                BufferedImage original = reader.read(0);
                double scale = Math.min(1.0, 1024.0 / Math.max(width, height));
                var normalized = new BufferedImage(Math.max(1, (int) (width * scale)), Math.max(1, (int) (height * scale)), BufferedImage.TYPE_INT_ARGB);
                var graphics = normalized.createGraphics();
                try {
                    graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
                    graphics.drawImage(original, 0, 0, normalized.getWidth(), normalized.getHeight(), null);
                } finally { graphics.dispose(); original.flush(); }
                try (var output = new ByteArrayOutputStream()) {
                    if (!ImageIO.write(normalized, "png", output)) throw new IOException("PNG no disponible");
                    return output.toByteArray();
                } finally { normalized.flush(); }
            } finally { reader.dispose(); }
        } catch (IOException exception) { throw CatalogException.invalid("No se pudo leer la imagen. Selecciona otro archivo PNG o JPEG."); }
    }

    public String store(byte[] bytes) throws IOException {
        String id = UUID.randomUUID().toString();
        Path partial = directory.resolve(id + ".part");
        try {
            Files.write(partial, bytes);
            Files.move(partial, directory.resolve(id + ".png"), StandardCopyOption.ATOMIC_MOVE);
        } finally { Files.deleteIfExists(partial); }
        return id;
    }

    public byte[] read(String id) throws IOException {
        Path file = path(id);
        if (!Files.isRegularFile(file, java.nio.file.LinkOption.NOFOLLOW_LINKS)) throw CatalogException.missing();
        return Files.readAllBytes(file);
    }

    public void discard(String id) throws IOException { Files.deleteIfExists(path(id)); }

    private Path path(String id) {
        if (id == null || !id.matches("[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}")) throw CatalogException.missing();
        return directory.resolve(id + ".png");
    }
}
