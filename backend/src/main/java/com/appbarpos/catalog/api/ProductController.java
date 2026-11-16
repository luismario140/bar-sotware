package com.appbarpos.catalog.api;

import com.appbarpos.auth.application.AuthSessions;
import com.appbarpos.catalog.application.ProductService;
import com.appbarpos.catalog.domain.Product;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/products")
public class ProductController {
    private final ProductService service;
    private final AuthSessions sessions;
    public ProductController(ProductService service, AuthSessions sessions) { this.service = service; this.sessions = sessions; }

    @GetMapping
    public List<Product> list() { return service.list(); }
    @PostMapping
    public ResponseEntity<Product> create(@RequestBody ProductCommands.Save input, HttpServletRequest request) throws Exception {
        return ResponseEntity.status(201).body(service.save(null, input, sessions.require(request).id()));
    }
    @PutMapping("/{id}")
    public Product update(@PathVariable String id, @RequestBody ProductCommands.Save input, HttpServletRequest request) throws Exception {
        return service.save(id, input, sessions.require(request).id());
    }
    @PostMapping("/{id}/status")
    public Product status(@PathVariable String id, @RequestBody ProductCommands.Status input, HttpServletRequest request) {
        return service.status(id, input, sessions.require(request).id());
    }
    @DeleteMapping("/{id}")
    public Product delete(@PathVariable String id, @RequestBody ProductCommands.Delete input, HttpServletRequest request) {
        return service.delete(id, input, sessions.require(request).id());
    }
    @PostMapping("/{id}/restock")
    public Product restock(@PathVariable String id, @RequestBody ProductCommands.Restock input, HttpServletRequest request) {
        return service.restock(id, input, sessions.require(request).id());
    }
    @PostMapping("/sales")
    public com.appbarpos.catalog.domain.SaleReceipt checkout(@RequestBody ProductCommands.Checkout input, HttpServletRequest request) {
        return service.checkout(input, sessions.require(request).id());
    }
    @GetMapping("/sales")
    public com.appbarpos.catalog.domain.SalesHistory sales(@RequestParam(defaultValue = "0") int page) {
        return service.sales(page);
    }
    @GetMapping("/{id}/image")
    public ResponseEntity<byte[]> image(@PathVariable String id) throws java.io.IOException {
        return ResponseEntity.ok().header("Cache-Control", "no-store").header("X-Content-Type-Options", "nosniff")
                .header("Content-Type", "image/png").body(service.image(id));
    }
}
