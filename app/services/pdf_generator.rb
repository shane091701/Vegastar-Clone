# Replaces Apps Script's HTML→PDF conversion (blob.getAs('application/pdf')).
# Renders HTML with a local Chromium-based browser via ferrum, stores the PDF
# as an ActiveStorage attachment on a GeneratedPdf record, and returns an
# inline URL the client can open — the equivalent of the original Drive URL.
require "ferrum"

class PdfGenerator
  BROWSER_CANDIDATES = [
    ENV["CHROME_PATH"],
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"
  ].freeze

  def self.browser_path
    BROWSER_CANDIDATES.compact.find { |p| File.exist?(p) }
  end

  def self.available?
    browser_path.present?
  end

  def self.store(doc_type:, reference_code:, html:, file_name:)
    pdf_data = render_pdf(html)
    record = GeneratedPdf.for(doc_type, reference_code)
    record.file.attach(io: StringIO.new(pdf_data), filename: file_name,
                       content_type: "application/pdf")
    Rails.application.routes.url_helpers.rails_blob_path(
      record.reload.file, disposition: "inline", only_path: true
    )
  end

  def self.render_pdf(html)
    path = browser_path
    raise "No Chromium-based browser found for PDF generation. Set CHROME_PATH." unless path

    browser = Ferrum::Browser.new(browser_path: path, headless: true, timeout: 60,
                                  browser_options: { "no-sandbox" => nil })
    begin
      page = browser.create_page
      # A data: URI (the previous approach) is unreliable in headless/
      # no-sandbox Chromium -- large or oddly-encoded payloads can fail to
      # be recognized as HTML at all, which shows up as the raw markup
      # ("<html>...") being printed as plain text instead of rendered.
      # Writing to a real file and navigating via file:// is the standard,
      # reliable way to hand Chromium HTML to render.
      Tempfile.create(["pdf_source", ".html"]) do |html_file|
        html_file.write(html)
        html_file.flush
        # An absolute path on Unix already starts with "/", so "file://" + path
        # naturally yields the correct three slashes (file:///tmp/x.html). On
        # Windows the path starts with a drive letter ("C:/..."), which needs
        # an extra leading slash to form a valid file URI (file:///C:/...) --
        # without it, "C:" gets misparsed as a URI host and the colon is lost.
        leading_slash = html_file.path.start_with?("/") ? "" : "/"
        page.go_to("file://#{leading_slash}#{html_file.path}")
        page.network.wait_for_idle(timeout: 10) rescue nil
        Tempfile.create(["doc", ".pdf"], binmode: true) do |f|
          page.pdf(path: f.path, format: :A4, printBackground: true)
          return File.binread(f.path)
        end
      end
    ensure
      browser.quit
    end
  end

  # Port of getPdfLogoHeaderHtml_ — Source/code.js:2245
  def self.logo_header_html(doc_title)
    <<~HTML
      <div style="text-align:center; margin-bottom:20px;">
        <img src="https://i.imgur.com/dhbq2a5.png" alt="SP Bedana Logo" style="max-height: 70px; width: auto; margin-bottom: 10px;"
             onerror="this.outerHTML='<h1 style=&quot;color:#f8b400;margin:0;&quot;>SP Bedana</h1>'">
        <p style="margin:5px 0; font-weight:bold; text-transform:uppercase;">#{doc_title}</p>
      </div>
    HTML
  end

  def self.fmt_currency(n)
    "₱" + ActiveSupport::NumberHelper.number_to_delimited(format("%.2f", n.to_f))
  end
end
