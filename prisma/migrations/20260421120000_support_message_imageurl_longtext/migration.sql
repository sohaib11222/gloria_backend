-- MySQL TEXT is 65,535 bytes; base64 data URLs for images up to 5MB exceed that.
ALTER TABLE `SupportMessage` MODIFY `imageUrl` LONGTEXT NULL;
